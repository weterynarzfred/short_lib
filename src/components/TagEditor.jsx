"use client";

import { useLayoutEffect, useRef, useState } from "react";

import TagSuggestions from "./TagSuggestions";
import useTagSuggestions from "../lib/useTagSuggestions";
import useCombobox from "@/lib/useCombobox";

import styles from "./TagEditor.module.scss";

export default function TagEditor({
  postId,
  value,
  setValue,
  saveTags,
  inputProps = {},
}) {
  const inputRef = useRef(null);
  const nextCursorRef = useRef(null);

  const [cursor, setCursor] = useState(value.length);

  const { items, isLoading } = useTagSuggestions(value, {
    mode: "edit",
    key: postId,
    position: cursor,
  });

  useLayoutEffect(() => {
    if (nextCursorRef.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(nextCursorRef.current, nextCursorRef.current);
      setCursor(nextCursorRef.current);
      nextCursorRef.current = null;
    }
  }, [value]);

  const updateCursorPos = () =>
    setCursor(inputRef?.current?.selectionStart ?? 0);

  const combobox = useCombobox({
    items,
    setValue,
    cursor,
    moveCursorTo: pos => nextCursorRef.current = pos,
  });
  const combinedInputProps = { ...combobox.getInputProps(), ...inputProps };

  return (
    <div ref={combobox.rootRef} className={styles.tagEditor}>
      <textarea
        ref={inputRef}
        value={value}
        onChange={e => {
          setValue(e.target.value);
          setCursor(e.target.selectionStart ?? 0);
        }}
        onClick={updateCursorPos}
        onKeyUp={updateCursorPos}
        onSelect={updateCursorPos}
        {...combinedInputProps}
        onKeyDown={event => {
          if (!combobox.isOpen && event.key === "Escape") {
            event.stopPropagation();
            event.target.blur();
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            if (combobox.isOpen) {
              event.stopPropagation();
              combinedInputProps.onKeyDown(event);
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            combobox.close();
            saveTags();
            return;
          }

          combinedInputProps.onKeyDown(event);
        }}
      />

      <TagSuggestions items={items} isLoading={isLoading} combobox={combobox} />
    </div>
  );
}
