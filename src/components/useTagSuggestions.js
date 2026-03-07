import { useEffect, useRef, useState } from "react";

export default function useTagSuggestions(value, options = {}) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const abortRef = useRef(null);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!value) return;
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    const trimmed = value.trim();

    if (!trimmed) {
      if (abortRef.current) abortRef.current.abort();
      setItems([]);
      setIsLoading(false);
      return;
    }

    const parts = trimmed.split(/\s+/);
    const query = parts[parts.length - 1].replace(/^-/, "");

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
          `/api/tags/suggest?q=${encodeURIComponent(query)}&is_edit=${options.mode === 'edit'}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        const tags = (Array.isArray(data.tags) ? data.tags : [])
          .filter(tag => !parts.includes(tag.name));

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
  }, [value, options.mode]);

  return { items, isLoading };
}
