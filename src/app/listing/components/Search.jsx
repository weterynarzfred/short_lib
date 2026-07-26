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
  // The last value this component wrote to the URL, so its own echo can be told apart
  // from a change that came from somewhere else.
  const lastPushedRef = useRef(initialValue);

  const { items, isLoading } = useTagSuggestions(value, { position: cursor });

  // The URL is the source of truth. A nav link back to /listing, or browser
  // back/forward, changes it without remounting this component, so the input has to
  // follow along or it keeps showing a search that is no longer applied.
  useEffect(() => {
    if (initialValue === lastPushedRef.current) return;

    lastPushedRef.current = initialValue;
    setValue(initialValue);
    setCursor(initialValue.length);
  }, [initialValue]);

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

      const nextQuery = params.toString();
      lastPushedRef.current = value;

      // Skip a navigation that would change nothing, which otherwise fires once on every
      // mount and on every reconciled value.
      if (nextQuery === window.location.search.replace(/^\?/, "")) return;

      router.replace(`?${nextQuery}`);
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
