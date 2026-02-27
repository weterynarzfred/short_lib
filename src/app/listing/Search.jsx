"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./Search.module.scss";

export default function Search({ initialValue = "" }) {
  const [value, setValue] = useState(initialValue);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const router = useRouter();
  const abortRef = useRef(null);
  const rootRef = useRef(null);
  const suppressSuggestRef = useRef(false);

  function clearSuggestions() {
    setItems([]);
    setIsOpen(false);
    setActiveIndex(-1);
  }

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

  useEffect(() => {
    if (suppressSuggestRef.current) {
      suppressSuggestRef.current = false;
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      clearSuggestions();
      return;
    }

    const parts = trimmed.split(/\s+/);
    const query = parts[parts.length - 1].replace(/^-/, '');

    if (!query || query === initialValue) {
      clearSuggestions();
      return;
    }

    const id = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/tags/suggest?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        const tags = (Array.isArray(data.tags) ? data.tags : [])
          .filter(tag => !parts.includes(tag.name));

        setItems(tags);
        setIsOpen(tags.length > 0);
        setActiveIndex(tags.length > 0 ? 0 : -1);
      } catch (e) {
        if (e.name !== "AbortError") clearSuggestions();
      } finally {
        setIsLoading(false);
      }
    }, 150);

    return () => clearTimeout(id);
  }, [value]);

  useEffect(() => {
    function onPointerDown(e) {
      if (!rootRef.current || rootRef.current.contains(e.target)) return;
      setIsOpen(false);
      setActiveIndex(-1);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const listId = useMemo(() => `tag-suggest-${Math.random().toString(36).slice(2)}`, []);

  function chooseTag(tag) {
    suppressSuggestRef.current = true;

    setValue(prev => {
      const trimmed = prev.trimEnd();
      const parts = trimmed.split(/\s+/);
      const isNegative = parts[parts.length - 1].startsWith("-");
      parts[parts.length - 1] = (isNegative ? "-" : "") + tag.name;
      return parts.join(" ") + " ";
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

      {isOpen ? <div className={styles.Suggestions} role="listbox" id={listId}>
        {isLoading ? <div className={styles.SuggestionMeta}>Loading…</div> : null}

        {items.map((t, idx) => (
          <div
            key={t.id}
            id={`${listId}-opt-${t.id}`}
            role="option"
            aria-selected={idx === activeIndex}
            className={`${styles.Suggestion} ${idx === activeIndex ? styles.Active : ""}`}
            onMouseDown={e => e.preventDefault()}
            onMouseEnter={() => setActiveIndex(idx)}
            onClick={() => chooseTag(t)}
          >
            <span className={styles.TagName}>{t.name}</span>
            <span className={styles.TagMeta}>{t.type}{" · "}{t.postCount}</span>
          </div>
        ))}
      </div> : null}
    </div>
  );
}
