"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import TagSuggestions from "@/components/TagSuggestions";
import useTagSuggestions from "@/components/useTagSuggestions";
import useCombobox from "@/components/useCombobox";

import styles from "./Search.module.scss";

export default function Search({ initialValue = "" }) {
  const router = useRouter();

  const [value, setValue] = useState(initialValue);
  const { items, isLoading } = useTagSuggestions(value);

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
      const trimmed = prev.trimEnd();
      const parts = trimmed.split(/\s+/);
      const isNegative = parts[parts.length - 1]?.startsWith("-");
      parts[parts.length - 1] = (isNegative ? "-" : "") + tag.name;
      return parts.join(" ") + (isOperator ? "" : " ");
    });
  }

  const combobox = useCombobox({ items, onSelect: chooseTag });

  return (
    <div ref={combobox.rootRef} className={styles.Search}>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        {...combobox.getInputProps()}
      />

      <TagSuggestions items={items} isLoading={isLoading} combobox={combobox} />
    </div>
  );
}
