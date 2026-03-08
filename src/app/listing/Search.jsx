"use client";

import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";

import TagSuggestions from "@/components/TagSuggestions";
import useTagSuggestions from "@/components/useTagSuggestions";
import useCombobox from "@/components/useCombobox";

import styles from "./Search.module.scss";

export default function Search({ initialValue = "" }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const nextCursorRef = useRef(null);
  const [value, setValue] = useState(initialValue);
  const [cursor, setCursor] = useState(initialValue.length);

  const { items, isLoading } = useTagSuggestions(value, { position: cursor });

  function updateCursor() {
    const el = inputRef.current;
    if (el) setCursor(el.selectionStart ?? 0);
  }

  useLayoutEffect(() => {
    if (nextCursorRef.current !== null && inputRef.current) {
      const pos = nextCursorRef.current;
      inputRef.current.setSelectionRange(pos, pos);
      setCursor(pos);
      nextCursorRef.current = null;
    }
  }, [value]);

  useEffect(() => {
    const id = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);

      if (value) params.set("search", value);
      else params.delete("search");

      router.replace(`?${params.toString()}`);
    }, 300);

    return () => clearTimeout(id);
  }, [value, router]);

  function chooseTag(tag) {
    const isOperator = tag.type === "operator";

    setValue(prev => {
      const pos = typeof cursor === "number" ? cursor : prev.length;
      const start = prev.slice(0, pos).lastIndexOf(" ") + 1;
      const endRel = prev.slice(pos).indexOf(" ");
      const end = endRel === -1 ? prev.length : pos + endRel;
      const isNegative = prev.slice(start, end).startsWith("-");
      const next =
        prev.slice(0, start) +
        (isNegative ? "-" : "") +
        tag.name +
        ((isOperator || end < prev.length) ? "" : " ") +
        prev.slice(end);

      nextCursorRef.current = start + insertion.length;
      return next;
    });
  }

  const combobox = useCombobox({ items, onSelect: chooseTag });

  return (
    <div ref={combobox.rootRef} className={styles.Search}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => {
          setValue(e.target.value);
          setCursor(e.target.selectionStart ?? 0);
        }}
        onClick={updateCursor}
        onKeyUp={updateCursor}
        onSelect={updateCursor}
        {...combobox.getInputProps()}
      />

      <TagSuggestions items={items} isLoading={isLoading} combobox={combobox} />
    </div>
  );
}
