"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import TagSuggestions from "@/components/TagSuggestions";

import styles from "./Search.module.scss";

export default function Search({ initialValue = "" }) {
  const [value, setValue] = useState(initialValue);
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const router = useRouter();
  const rootRef = useRef(null);
  const suppressSuggestRef = useRef(false);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

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
    if (!isOperator) suppressSuggestRef.current = true;

    setValue(prev => {
      const trimmed = prev.trimEnd();
      const parts = trimmed.split(/\s+/);
      const isNegative = parts[parts.length - 1].startsWith("-");
      parts[parts.length - 1] = (isNegative ? "-" : "") + tag.name;
      return parts.join(" ") + (isOperator ? "" : " ");
    });

    setIsOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(e) {
    if (!isOpen) {
      if (e.key === "ArrowDown" && items.length > 0) {
        setIsOpen(true);
        setActiveIndex(0);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < items.length) {
        e.preventDefault();
        chooseTag(items[activeIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  const listId = useMemo(() => `tag-suggest-${Math.random().toString(36).slice(2)}`, []);

  return (
    <div className={styles.Search} ref={rootRef}>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onFocus={() => { if (items.length > 0) setIsOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder="Search…"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? `${listId}-opt-${items[activeIndex].id}` : undefined
        }
      />

      <TagSuggestions
        value={value}
        setValue={setValue}
        items={items}
        setItems={setItems}
        activeIndex={activeIndex}
        setActiveIndex={setActiveIndex}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        rootRef={rootRef}
        suppressSuggestRef={suppressSuggestRef}
        listId={listId}
      />
    </div>
  );
}
