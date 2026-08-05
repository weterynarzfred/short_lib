"use client";

import { useMemo, useState, useTransition } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { updateTagTypeOrderAction } from "@/lib/actions";
import {
  DEFAULT_TAG_TYPE_COLOR,
  mergeTagTypeColors,
  normalizeTagTypeColor,
  normalizeTagTypeColors,
  normalizeTagTypeOrder,
} from "@/lib/tagTypeOrder";
import TagTypeRow from "./TagTypeRow";

import styles from "../page.module.scss";

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
    .map(type => `${type}:${normalizeTagTypeColor(colorMap?.[type])}`)
    .join("|");
}

export default function TagTypeOrderSetting({
  initialValue = "",
  initialColors = {},
}) {
  const normalizedInitialOrder = useMemo(
    () => normalizeTagTypeOrder(initialValue),
    [initialValue]
  );
  const normalizedInitialColors = useMemo(
    () => normalizeTagTypeColors(initialColors),
    [initialColors]
  );
  const availableTypes = useMemo(
    () => Object.keys(normalizedInitialColors),
    [normalizedInitialColors]
  );
  const normalizedInitial = useMemo(
    () => buildOrderedTypes(normalizedInitialOrder, availableTypes),
    [normalizedInitialOrder, availableTypes]
  );
  const normalizedInitialPalette = useMemo(
    () => mergeTagTypeColors(normalizedInitialColors, normalizedInitial),
    [normalizedInitialColors, normalizedInitial]
  );

  const [value, setValue] = useState(normalizedInitial);
  const [savedValue, setSavedValue] = useState(normalizedInitial);
  const [colors, setColors] = useState(normalizedInitialPalette);
  const [savedColors, setSavedColors] = useState(normalizedInitialPalette);
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

  const isDirty = value.join(" ") !== savedValue.join(" ")
    || serializeColors(value, colors) !== serializeColors(savedValue, savedColors);

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

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = value.indexOf(active.id);
    const newIndex = value.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    setNextValue(arrayMove(value, oldIndex, newIndex));
  }

  function saveValue() {
    if (!isDirty || isPending) return;

    setError("");
    setStatus("");

    startTransition(async () => {
      try {
        const requestedColors = mergeTagTypeColors(colors, value);
        const result = await updateTagTypeOrderAction(value.join(" "), requestedColors);

        const persistedColors = mergeTagTypeColors(
          normalizeTagTypeColors(result?.tagTypeColors ?? requestedColors),
          value
        );
        const persistedTypes = buildOrderedTypes(
          normalizeTagTypeOrder(result?.tagTypeOrderValue),
          Object.keys(persistedColors)
        );
        const nextColors = mergeTagTypeColors(persistedColors, persistedTypes);

        setValue(persistedTypes);
        setSavedValue(persistedTypes);
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
                color={colors[type] ?? DEFAULT_TAG_TYPE_COLOR}
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
                onMoveUp={() => {
                  if (index === 0) return;
                  setNextValue(arrayMove(value, index, index - 1));
                }}
                onMoveDown={() => {
                  if (index === value.length - 1) return;
                  setNextValue(arrayMove(value, index, index + 1));
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext> : <p className={styles.tagTypeOrderEmpty}>
        no tag types found in the database yet.
      </p>}

      <div className={styles.settingActions}>
        <button
          type="button"
          className={styles.settingButton}
          disabled={!isDirty || isPending}
          onClick={saveValue}
        >{isPending ? "saving..." : "save"}</button>

        <button
          type="button"
          className={styles.settingButton}
          disabled={!isDirty || isPending}
          onClick={() => {
            setNextValue(savedValue);
            setNextColors(savedColors);
            setActiveColorPickerId(null);
          }}
        >reset</button>

        {status ? <div className={styles.statusOk}>{status}</div> : null}
        {error ? <div className={styles.statusError}>{error}</div> : null}
      </div>
    </div>
  );
}

