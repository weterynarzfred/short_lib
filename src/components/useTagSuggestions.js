import { useEffect, useRef, useState } from "react";

export default function useTagSuggestions(value, options = {}) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const abortRef = useRef(null);
  const didMountRef = useRef(false);
  const prevKey = useRef(undefined);

  useEffect(() => {
    const pos = typeof options.position === "number" ? options.position : value.length;
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    const lastChar = before.slice(-1);

    if (!value || lastChar === " ") {
      setItems([]);
      didMountRef.current = true;
      return;
    }

    if (prevKey.current !== options.key || !didMountRef.current) {
      didMountRef.current = true;
      prevKey.current = options.key;
      setItems([]);
      return;
    }

    const start = before.lastIndexOf(" ") + 1;
    const endRel = after.indexOf(" ");
    const end = endRel === -1 ? value.length : pos + endRel;
    const query = value.slice(start, end).replace(/^-/, "");
    const parts = value.trim().replace(/(^| )-/, "").split(/\s+/);

    if (!query) {
      if (abortRef.current) abortRef.current.abort();
      setItems([]);
      setIsLoading(false);
      return;
    }

    const id = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);

      try {
        const res = await fetch(
          `/api/tags/suggest?q=${encodeURIComponent(query)}&is_edit=${options.mode === "edit"}`,
          { signal: controller.signal }
        );

        if (!res.ok) throw new Error();

        const data = await res.json();
        const tags = (Array.isArray(data.tags) ? data.tags : []).filter(
          tag => !parts.includes(tag.name)
        );

        setItems(tags);
      } catch (e) {
        if (e.name !== "AbortError") setItems([]);
      } finally {
        if (abortRef.current === controller) setIsLoading(false);
      }
    }, 150);

    return () => {
      clearTimeout(id);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [value, options.mode, options.position]);

  return { items, isLoading };
}
