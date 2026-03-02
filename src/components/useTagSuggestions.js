import { useEffect, useRef, useState } from "react";

export default function useTagSuggestions(value) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const abortRef = useRef(null);

  useEffect(() => {
    const trimmed = value.trim();

    if (!trimmed) {
      setItems([]);
      return;
    }

    const parts = trimmed.split(/\s+/);
    const query = parts[parts.length - 1].replace(/^-/, "");

    if (!query) {
      setItems([]);
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
      } catch (e) {
        if (e.name !== "AbortError") setItems([]);
      } finally {
        setIsLoading(false);
      }
    }, 150);

    return () => clearTimeout(id);
  }, [value]);

  return { items, isLoading };
}
