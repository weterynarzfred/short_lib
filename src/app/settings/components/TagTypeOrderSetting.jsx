"use client";

import { useMemo, useState, useTransition } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { updateTagTypeOrderAction } from "@/lib/actions";

import styles from "../page.module.scss";

function normalizeTypes(value) {
  const seen = new Set();
  const normalized = [];

  for (const token of String(value ?? "").trim().split(/\s+/)) {
    const type = token.trim().toLowerCase();
    if (!type || seen.has(type)) continue;
    seen.add(type);
    normalized.push(type);
  }

  return normalized;
}

function SortableTypeItem({ id, index, total, onMoveUp, onMoveDown }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

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

      <code className={styles.tagTypeOrderName}>{id}</code>

      <div className={styles.tagTypeOrderItemActions}>
        <button
          type="button"
          className={styles.settingButton}
          onClick={onMoveUp}
          disabled={index === 0}
        >↑</button>

        <button
          type="button"
          className={styles.settingButton}
          onClick={onMoveDown}
          disabled={index === total - 1}
        >↓</button>
      </div>
    </li>
  );
}

export default function TagTypeOrderSetting({ initialValue = "" }) {
  const normalizedInitial = useMemo(() => normalizeTypes(initialValue), [initialValue]);

  const [value, setValue] = useState(normalizedInitial);
  const [savedValue, setSavedValue] = useState(normalizedInitial);
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

  const isDirty = value.join(" ") !== savedValue.join(" ");

  function setNextValue(nextValue) {
    setValue(nextValue);
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
        const result = await updateTagTypeOrderAction(value.join(" "));
        const nextValue = normalizeTypes(result?.tagTypeOrderValue);

        setValue(nextValue);
        setSavedValue(nextValue);
        setStatus("saved");
      } catch {
        setError("failed to save setting");
      }
    });
  }

  return (
    <div className={styles.tagTypeOrderEditor}>
      <DndContext
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
      </DndContext>

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
          }}
        >reset</button>

        {status ? <div className={styles.statusOk}>{status}</div> : null}
        {error ? <div className={styles.statusError}>{error}</div> : null}
      </div>
    </div>
  );
}
