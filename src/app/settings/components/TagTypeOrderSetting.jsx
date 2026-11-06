"use client";

import { useState, useTransition } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { updateTagTypeOrderAction } from "@/lib/actions";
import {
  mergeTagTypeColors,
  normalizeTagTypeColor,
  normalizeTagTypeColors,
  normalizeTagTypeOrder,
} from "@/lib/tagTypeOrder";
import SettingActions from "./SettingActions";
import TagTypeRow from "./TagTypeRow";

import styles from "../page.module.scss";

// The stored order also lists types that have no tags; only the available ones are shown.
function buildOrderedTypes(preferredOrder, availableTypes) {
  const availableSet = new Set(availableTypes);
  const ordered = [];
  const seen = new Set();

  for (const type of [...preferredOrder, ...availableTypes]) {
    if (!availableSet.has(type) || seen.has(type)) continue;

    seen.add(type);
    ordered.push(type);
  }

  return ordered;
}

// Compared as one string so a colour change counts as dirty just like a reorder does.
function serializeColors(types, colorMap) {
  return types
    .map(type => `${type}:${normalizeTagTypeColor(colorMap[type])}`)
    .join("|");
}

export default function TagTypeOrderSetting({ initialValue, initialColors }) {
  const availableColors = normalizeTagTypeColors(initialColors);
  const initialTypes = buildOrderedTypes(
    normalizeTagTypeOrder(initialValue),
    Object.keys(availableColors)
  );
  const initialPalette = mergeTagTypeColors(availableColors, initialTypes);

  const [value, setValue] = useState(initialTypes);
  const [savedValue, setSavedValue] = useState(initialTypes);
  const [colors, setColors] = useState(initialPalette);
  const [savedColors, setSavedColors] = useState(initialPalette);
  const [activeColorPickerId, setActiveColorPickerId] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const isDirty = serializeColors(value, colors) !== serializeColors(savedValue, savedColors);

  function setNextValue(nextValue) {
    setValue(nextValue);
    setStatus("");
    setError("");
  }

  function setNextColors(nextColors) {
    setColors(nextColors);
    setStatus("");
    setError("");
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;

    setNextValue(arrayMove(value, value.indexOf(active.id), value.indexOf(over.id)));
  }

  function saveValue() {
    setError("");
    setStatus("");

    startTransition(async () => {
      try {
        const result = await updateTagTypeOrderAction(
          value.join(" "),
          mergeTagTypeColors(colors, value)
        );
        const nextTypes = buildOrderedTypes(normalizeTagTypeOrder(result.tagTypeOrderValue), value);
        const nextColors = mergeTagTypeColors(result.tagTypeColors, nextTypes);

        setValue(nextTypes);
        setSavedValue(nextTypes);
        setColors(nextColors);
        setSavedColors(nextColors);
        setActiveColorPickerId(null);
        setStatus("saved");
      } catch {
        setError("failed to save setting");
      }
    });
  }

  return (
    <div className={styles.tagTypeOrderEditor}>
      {value.length ? <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={value}
          strategy={verticalListSortingStrategy}
        >
          <ul className={styles.tagTypeOrderList}>
            {value.map((type, index) => (
              <TagTypeRow
                key={type}
                id={type}
                index={index}
                total={value.length}
                color={colors[type]}
                isPickerOpen={activeColorPickerId === type}
                onOpenPicker={() => setActiveColorPickerId(type)}
                onClosePicker={() => {
                  setActiveColorPickerId(currentId => currentId === type ? null : currentId);
                }}
                onColorChange={nextColor => {
                  setNextColors({
                    ...colors,
                    [type]: normalizeTagTypeColor(nextColor),
                  });
                }}
                onMoveUp={() => setNextValue(arrayMove(value, index, index - 1))}
                onMoveDown={() => setNextValue(arrayMove(value, index, index + 1))}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext> : <p className={styles.tagTypeOrderEmpty}>
        no tag types found in the database yet.
      </p>}

      <SettingActions
        isDirty={isDirty}
        isPending={isPending}
        onSave={saveValue}
        onReset={() => {
          setNextValue(savedValue);
          setNextColors(savedColors);
          setActiveColorPickerId(null);
        }}
        status={status}
        error={error}
      />
    </div>
  );
}
