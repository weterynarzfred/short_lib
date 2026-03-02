import { useEffect, useRef, useState } from "react";

export default function useTagSuggestions({
  value,
  setIsOpen,
  setItems,
  setActiveIndex,
  rootRef,
  suppressSuggestRef,
}) {
  function clearSuggestions() {
    setItems([]);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  const [isLoading, setIsLoading] = useState(false);

  const abortRef = useRef(null);

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

    if (!query) {
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

  return isLoading;
}
