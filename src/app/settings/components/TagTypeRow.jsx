"use client";

import { useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HexColorPicker } from "react-colorful";

import { getTagTypeClassName, normalizeTagTypeColor } from "@/lib/tagTypeOrder";

import styles from "../page.module.scss";

const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{3,6}$/;

function isHexColor(value) {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim());
}

// One draggable row: the tag type, its colour, and the up/down buttons that do the same job
// as dragging for anyone not using a mouse.
export default function TagTypeRow({
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
  // Held separately from `color` so a half-typed hex does not repaint the tag on every
  // keystroke; it is pushed up only once the text is a valid colour.
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

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
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
        >{"↑"}</button>

        <button
          type="button"
          className={styles.settingButton}
          onClick={onMoveDown}
          disabled={index === total - 1}
        >{"↓"}</button>
      </div>
    </li>
  );
}
