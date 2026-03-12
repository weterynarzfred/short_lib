"use client";

import { useEffect, useLayoutEffect, useRef, useState, } from "react";
import { useRouter } from "next/navigation";

import TagSuggestions from "@/components/TagSuggestions";
import useTagSuggestions from "@/lib/useTagSuggestions";
import useCombobox from "@/lib/useCombobox";

import styles from "./Search.module.scss";

export default function Search({ initialValue = "" }) {
  const router = useRouter();

  const [value, setValue] = useState(initialValue);
  const [cursor, setCursor] = useState(initialValue.length);

  const inputRef = useRef(null);
  const nextCursorRef = useRef(null);

  const { items, isLoading } = useTagSuggestions(value, { position: cursor });

  useLayoutEffect(() => {
    if (nextCursorRef.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(nextCursorRef.current, nextCursorRef.current);
      setCursor(nextCursorRef.current);
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

  const updateCursorPos = () =>
    setCursor(inputRef?.current?.selectionStart ?? 0);

  const combobox = useCombobox({
    items,
    setValue,
    cursor,
    moveCursorTo: pos => nextCursorRef.current = pos,
  });

  return (
    <div
      ref={combobox.rootRef}
      className={styles.search}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={e => {
          setValue(e.target.value);
          setCursor(e.target.selectionStart ?? 0);
        }}
        onClick={updateCursorPos}
        onKeyUp={updateCursorPos}
        onSelect={updateCursorPos}
        {...combobox.getInputProps()}
      />

      <TagSuggestions items={items} isLoading={isLoading} combobox={combobox} />
    </div>
  );
}
