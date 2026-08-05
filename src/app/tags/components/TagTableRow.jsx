"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";

import TagSuggestions from "@/components/TagSuggestions";
import { useTagHoverProps } from "@/components/TagTooltip";
import useCombobox from "@/lib/useCombobox";
import useTagSuggestions from "@/lib/useTagSuggestions";
import { getTagTypeClassName } from "@/lib/tagTypeOrder";

import styles from "./TagTable.module.scss";

function AliasInput({ tagId, isPending, onAdd }) {
  const [value, setValue] = useState("");

  async function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const name = value.trim();
      if (!name) return;

      // Keep the text when rejected, so the error message is actionable.
      const result = await onAdd(tagId, name);
      if (result?.ok !== false) setValue("");
    }
  }

  return <input
    type="text"
    value={value}
    onChange={e => setValue(e.target.value)}
    onKeyDown={handleKeyDown}
    placeholder="add alias..."
    className={styles.inlineInput}
    disabled={isPending}
  />;
}

// Unlike the alias input this one suggests tags, because an implication points at a tag
// that usually already exists. Aliases are the opposite case: addTagAlias rejects any name
// that is already a tag or alias, so every suggestion would be a guaranteed rejection.
function ImplicationInput({ tagId, isPending, onAdd }) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);

  const inputRef = useRef(null);
  const nextCursorRef = useRef(null);

  const { items, isLoading } = useTagSuggestions(value, {
    mode: "edit",
    key: tagId,
    position: cursor,
  });

  const combobox = useCombobox({
    items,
    setValue,
    cursor,
    moveCursorTo: pos => { nextCursorRef.current = pos; },
  });

  const comboboxInputProps = combobox.getInputProps();

  useLayoutEffect(() => {
    if (nextCursorRef.current === null || !inputRef.current) return;

    inputRef.current.setSelectionRange(nextCursorRef.current, nextCursorRef.current);
    setCursor(nextCursorRef.current);
    nextCursorRef.current = null;
  }, [value]);

  const updateCursorPos = () => setCursor(inputRef.current?.selectionStart ?? 0);

  async function submit() {
    const name = value.trim();
    if (!name) return;

    const result = await onAdd(tagId, name);
    if (result?.ok !== false) setValue("");
  }

  function handleKeyDown(event) {
    comboboxInputProps.onKeyDown(event);
    // The combobox claims Enter when a suggestion is highlighted, so submitting here too
    // would both accept the suggestion and immediately send the half-typed value.
    if (event.defaultPrevented || event.key !== "Enter") return;

    event.preventDefault();
    submit();
  }

  return <div ref={combobox.rootRef} className={styles.inlineCombobox}>
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={event => {
        setValue(event.target.value);
        setCursor(event.target.selectionStart ?? 0);
      }}
      onClick={updateCursorPos}
      onKeyUp={updateCursorPos}
      onSelect={updateCursorPos}
      placeholder="add tag name..."
      className={styles.inlineInput}
      disabled={isPending}
      {...comboboxInputProps}
      onKeyDown={handleKeyDown}
    />

    <TagSuggestions items={items} isLoading={isLoading} combobox={combobox} />
  </div>;
}

export default function TagTableRow({ tag, editor }) {
  const tagHoverProps = useTagHoverProps();
  const {
    editingTagId,
    confirmDeleteTagId,
    pendingTagId,
    setConfirmDeleteTagId,
    updateDraft,
    getDraft,
    isDirty,
    startEdit,
    cancelEdit,
    saveEdit,
    deleteTag,
    handleEditKeyDown,
    addAlias,
    removeAlias,
    addImplication,
    removeImplication,
  } = editor;

  const draft = getDraft(tag);
  const isRowPending = pendingTagId === tag.id;
  const isBeingEdited = editingTagId === tag.id;
  const isConfirmingDelete = confirmDeleteTagId === tag.id;
  const isAnyPending = pendingTagId !== null;
  const isSaveDisabled = !isDirty(tag) || isRowPending;

  return <>
    <tr>
      <td className={getTagTypeClassName(tag.type) || undefined}>
        {isBeingEdited ? <input
          type="text"
          value={draft.name}
          onChange={event => updateDraft(tag.id, { name: event.target.value })}
          onKeyDown={event => handleEditKeyDown(event, tag, isRowPending)}
          className={styles.textInput}
          autoFocus
        /> : <Link
          href={`/listing?search=${encodeURIComponent(tag.name)}`}
          {...tagHoverProps(tag.name)}
        >
          {tag.name}
        </Link>}
      </td>

      <td>
        {isBeingEdited ? <input
          type="text"
          value={draft.type}
          onChange={event => updateDraft(tag.id, { type: event.target.value })}
          onKeyDown={event => handleEditKeyDown(event, tag, isRowPending)}
          className={styles.textInput}
        /> : tag.type}
      </td>

      <td>{tag.post_count}</td>

      <td className={styles.actions}>
        {isBeingEdited ? <>
          <button
            type="button"
            className={styles.button}
            onClick={() => saveEdit(tag)}
            disabled={isSaveDisabled}
          >{isRowPending ? "saving..." : "save"}</button>

          <button
            type="button"
            className={styles.button}
            onClick={() => cancelEdit(tag)}
            disabled={isRowPending}
          >cancel</button>
        </> : <>
          <button
            type="button"
            className={styles.button}
            onClick={() => startEdit(tag)}
            disabled={isAnyPending}
          >edit</button>

          {isConfirmingDelete ? <>
            <button
              type="button"
              className={styles.button}
              onClick={() => setConfirmDeleteTagId(null)}
              disabled={isRowPending}
            >cancel</button>
            <button
              type="button"
              className={styles.deleteButton}
              onClick={() => deleteTag(tag.id)}
              disabled={isRowPending}
            >{isRowPending ? "deleting..." : "confirm"}</button>
          </> :
            <button
              type="button"
              className={styles.deleteButton}
              onClick={() => setConfirmDeleteTagId(tag.id)}
              disabled={isAnyPending}
            >delete</button>}
        </>}
      </td>
    </tr>

    {isBeingEdited && <tr>
      <td colSpan={4} className={styles.expandedRow}>
        <div className={styles.expandedSection}>
          <label>description</label>
          <textarea
            value={draft.description}
            onChange={e => updateDraft(tag.id, { description: e.target.value })}
            className={styles.descriptionInput}
            rows={3}
            placeholder="markdown description..."
            disabled={isRowPending}
          />
        </div>

        <div className={styles.expandedSection}>
          <label>aliases</label>
          <div className={styles.chipRow}>
            {(tag.aliases ?? []).map(alias => (
              <span key={alias} className={styles.chip}>
                {alias}
                <button
                  type="button"
                  onClick={() => removeAlias(tag.id, alias)}
                  disabled={isRowPending}
                >×</button>
              </span>
            ))}
            <AliasInput tagId={tag.id} isPending={isRowPending} onAdd={addAlias} />
          </div>
        </div>

        <div className={styles.expandedSection}>
          <label>implies</label>
          <div className={styles.chipRow}>
            {(tag.implications ?? []).map(imp => (
              <span key={imp.id} className={styles.chip} {...tagHoverProps(imp.name)}>
                {imp.name}
                <button
                  type="button"
                  onClick={() => removeImplication(tag.id, imp.id)}
                  disabled={isRowPending}
                >×</button>
              </span>
            ))}
            <ImplicationInput tagId={tag.id} isPending={isRowPending} onAdd={addImplication} />
          </div>
        </div>
      </td>
    </tr>}
  </>;
}
