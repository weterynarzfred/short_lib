"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import classNames from "classnames";
import { createEditor } from "prism-code-editor";
import "prism-code-editor/layout.css";

import {
  registerKnownTags,
  registerKnownTagsFromValue,
} from "@/lib/tagsLanguage";
import TagSuggestions from "./TagSuggestions";
import useTagSuggestions from "@/lib/useTagSuggestions";
import useCombobox from "@/lib/useCombobox";
import useTagTokenHover from "@/lib/useTagTokenHover";
import styles from "./TagEditor.module.scss";

export default function TagEditor({
  postId,
  value,
  setValue,
  saveTags,
  focusRef,
  inputProps = {},
  knownTags = [],
}) {
  const { className: editorClassName, placeholder, disabled } = inputProps;

  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const inputRef = useRef(null);
  const nextCursorRef = useRef(null);
  const prevValueRef = useRef(value);
  const [cursor, setCursor] = useState(value.length);
  const [isEditorReady, setIsEditorReady] = useState(false);

  const { items, isLoading } = useTagSuggestions(value, {
    mode: "edit",
    key: postId,
    position: cursor,
  });

  const combobox = useCombobox({
    items,
    setValue,
    cursor,
    moveCursorTo: pos => { nextCursorRef.current = pos; },
  });

  const comboboxInputProps = combobox.getInputProps();

  useEffect(() => {
    registerKnownTags(knownTags);
    registerKnownTags(items);
    registerKnownTagsFromValue(value);
  }, [knownTags, items, value]);

  // Read by the listeners attached once on mount, so they always see current handlers.
  const handlersRef = useRef(null);
  handlersRef.current = {
    isOpen: combobox.isOpen,
    close: combobox.close,
    comboboxKeyDown: comboboxInputProps.onKeyDown,
    comboboxInput: comboboxInputProps.onInput,
    comboboxFocus: comboboxInputProps.onFocus,
    saveTags,
    setValue,
  };

  useEffect(() => {
    const editor = createEditor(containerRef.current, {
      language: "tags",
      value: prevValueRef.current,
      lineNumbers: false,
      wordWrap: true,
      readOnly: Boolean(disabled),
    });

    editorRef.current = editor;
    inputRef.current = editor.textarea;
    // Flips a state flag rather than relying on effect ordering, so the hover hook can
    // depend on the refs actually being populated.
    setIsEditorReady(true);
    if (focusRef) focusRef.current = editor.textarea;
    if (placeholder) editor.textarea.placeholder = placeholder;

    const offUpdate = editor.on("update", newVal => {
      prevValueRef.current = newVal;
      handlersRef.current.setValue(newVal);
      setCursor(editor.textarea.selectionStart ?? 0);
    });

    const ta = editor.textarea;
    const ac = new AbortController();
    const { signal } = ac;

    const onCursor = () => setCursor(ta.selectionStart ?? 0);
    ta.addEventListener("click", onCursor, { signal });
    ta.addEventListener("keyup", onCursor, { signal });
    ta.addEventListener("select", onCursor, { signal });

    ta.addEventListener("input", () => handlersRef.current.comboboxInput(), { signal });
    ta.addEventListener("focus", () => handlersRef.current.comboboxFocus(), { signal });

    ta.addEventListener("keydown", e => {
      const h = handlersRef.current;

      if (!h.isOpen && e.key === "Escape") {
        e.stopPropagation();
        ta.blur();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (h.isOpen) {
          e.stopPropagation();
          h.comboboxKeyDown(e);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        h.close();
        h.saveTags();
        return;
      }

      h.comboboxKeyDown(e);
    }, { signal });

    return () => {
      ac.abort();
      offUpdate();
      editor.remove();
      editorRef.current = null;
      inputRef.current = null;
      if (focusRef) focusRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useTagTokenHover(containerRef, inputRef, { enabled: isEditorReady });

  // Value sync and cursor restore share one layout effect because setOptions resets the
  // cursor (textarea.selectionEnd = 0), so the restore has to run after it.
  useLayoutEffect(() => {
    if (!editorRef.current) return;

    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      editorRef.current.setOptions({ value });
    }

    if (nextCursorRef.current !== null) {
      inputRef.current.setSelectionRange(nextCursorRef.current, nextCursorRef.current);
      setCursor(nextCursorRef.current);
      nextCursorRef.current = null;
    }
  }, [value]);

  useEffect(() => {
    editorRef.current?.setOptions({ readOnly: Boolean(disabled) });
  }, [disabled]);

  return (
    <div ref={combobox.rootRef} className={styles.tagEditor}>
      <div
        ref={containerRef}
        className={classNames(styles.editorMount, editorClassName)}
      />
      <TagSuggestions items={items} isLoading={isLoading} combobox={combobox} />
    </div>
  );
}
