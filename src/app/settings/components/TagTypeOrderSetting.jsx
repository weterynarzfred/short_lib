"use client";

import classNames from "classnames";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HexColorPicker } from "react-colorful";

import { updateTagTypeOrderAction } from "@/lib/actions";
import {
  DEFAULT_TAG_TYPE_COLOR,
  getTagTypeClassName,
  normalizeTagTypeColor,
  normalizeTagTypeOrder,
} from "@/lib/tagTypeOrder";

import styles from "../page.module.scss";

const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{3,6}$/;

function isHexColor(value) {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim());
}

function normalizeTagTypeColors(rawValue) {
  const normalized = {};
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue))
    return normalized;

  for (const [rawType, rawColor] of Object.entries(rawValue)) {
    const type = String(rawType ?? "").trim().toLowerCase();
    if (!type) continue;
    normalized[type] = normalizeTagTypeColor(rawColor);
  }

  return normalized;
}

function mergeTagTypeColors(preferredColors = {}, availableTypes = []) {
  const normalizedColors = normalizeTagTypeColors(preferredColors);
  const merged = {};
  const seen = new Set();

  for (const rawType of availableTypes) {
    const type = String(rawType ?? "").trim().toLowerCase();
    if (!type || seen.has(type)) continue;
    seen.add(type);
    merged[type] = normalizedColors[type] ?? DEFAULT_TAG_TYPE_COLOR;
  }

  return merged;
}

function buildOrderedTypes(preferredOrder, availableTypes) {
  const availableSet = new Set(availableTypes);
  const ordered = [];
  const seen = new Set();

  for (const type of preferredOrder) {
    if (!availableSet.has(type) || seen.has(type)) continue;

    seen.add(type);
    ordered.push(type);
  }

  for (const type of availableTypes) {
    if (seen.has(type)) continue;

    seen.add(type);
    ordered.push(type);
  }

  return ordered;
}

function serializeColors(types, colorMap) {
  return types
    .map(type => `${type}:${normalizeTagTypeColor(colorMap?.[type])}`)
    .join("|");
}

function buildColorPayload(types, colorMap) {
  const payload = {};

  for (const type of types)
    payload[type] = normalizeTagTypeColor(colorMap?.[type]);

  return payload;
}

function SortableTypeItem({
  id,
  index,
  total,
  color,
  isPickerOpen,
  onColorChange,
  onOpenPicker,
  onClosePicker,
  onMoveUp,
  onMoveDown,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const pickerWrapRef = useRef(null);
  const [hexInputValue, setHexInputValue] = useState(color);

  useEffect(() => {
    setHexInputValue(color);
  }, [color]);

  useEffect(() => {
    if (!isPickerOpen) return;

    const handlePointerDown = event => {
      if (!pickerWrapRef.current?.contains(event.target))
        onClosePicker();
    };
    const handleKeyDown = event => {
      if (event.key === "Escape")
        onClosePicker();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPickerOpen, onClosePicker]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={styles.tagTypeOrderItem}
      data-dragging={isDragging || undefined}
    >
      <button
        type="button"
        className={styles.tagTypeOrderHandle}
        aria-label={`drag ${id}`}
        {...attributes}
        {...listeners}
      ><svg viewBox="0 0 10 10">
          <path d="M3 9L3 1M5 9L5 1M7 9L7 1" />
        </svg></button>

      <code className={classNames(styles.tagTypeOrderName, getTagTypeClassName(id))}>{id}</code>

      <div className={styles.tagTypeColorField} ref={pickerWrapRef}>
        <input
          type="text"
          className={styles.tagTypeColorHexInput}
          value={hexInputValue}
          aria-label={`hex color for ${id}`}
          spellCheck={false}
          onFocus={onOpenPicker}
          onClick={onOpenPicker}
          onChange={event => {
            const nextValue = event.target.value;
            setHexInputValue(nextValue);

            if (isHexColor(nextValue))
              onColorChange(nextValue.trim());
          }}
          onBlur={() => {
            if (isHexColor(hexInputValue)) {
              const normalized = hexInputValue.trim();
              setHexInputValue(normalized);
              onColorChange(normalized);
              return;
            }

            setHexInputValue(color);
          }}
        />

        {isPickerOpen ? <div className={styles.tagTypeColorPopup}>
          <div className={styles.tagTypeColorPicker}>
            <HexColorPicker
              color={color}
              onChange={nextColor => {
                const normalized = normalizeTagTypeColor(nextColor);
                onColorChange(normalized);
                setHexInputValue(normalized);
              }}
            />
          </div>
        </div> : null}
      </div>

      <div className={styles.tagTypeOrderItemActions}>
        <button
          type="button"
          className={styles.settingButton}
          onClick={onMoveUp}
          disabled={index === 0}
        >{"\u2191"}</button>

        <button
          type="button"
          className={styles.settingButton}
          onClick={onMoveDown}
          disabled={index === total - 1}
        >{"\u2193"}</button>
      </div>
    </li>
  );
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
        const requestedColors = buildColorPayload(value, colors);
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
              <SortableTypeItem
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

