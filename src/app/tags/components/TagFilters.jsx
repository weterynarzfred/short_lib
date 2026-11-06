"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import AppSelect from "@/components/AppSelect";

import styles from "../page.module.scss";

const DEBOUNCE_MS = 300;
const ALL_TYPES_VALUE = "__all_types__";

export default function TagFilters({ initialName, initialType, tagTypes }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounceRef = useRef(null);

  const [name, setName] = useState(initialName);
  const [type, setType] = useState(initialType);

  useEffect(() => {
    setName(initialName);
    setType(initialType);
  }, [initialName, initialType]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function scheduleApply(nextName, nextType) {
    clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmedName = nextName.trim();

      if (trimmedName) params.set("name", trimmedName);
      else params.delete("name");

      if (nextType) params.set("type", nextType);
      else params.delete("type");

      params.set("page", "1");

      const nextQuery = params.toString();
      if (nextQuery !== searchParams.toString())
        router.replace(`${pathname}?${nextQuery}`);
    }, DEBOUNCE_MS);
  }

  return (
    <div className={styles.filters}>
      <input
        className={styles.nameInput}
        aria-label="filter tags by name"
        type="text"
        value={name}
        placeholder="filter by tag name"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={event => {
          const nextName = event.target.value;
          setName(nextName);
          scheduleApply(nextName, type);
        }}
      />

      <AppSelect
        ariaLabel="filter tags by type"
        className={styles.typeSelect}
        value={type || ALL_TYPES_VALUE}
        onValueChange={nextValue => {
          const nextType = nextValue === ALL_TYPES_VALUE ? "" : nextValue;
          setType(nextType);
          scheduleApply(name, nextType);
        }}
        options={[
          { value: ALL_TYPES_VALUE, label: "all types" },
          ...tagTypes.map(tagType => ({ value: tagType, label: tagType })),
        ]}
      />
    </div>
  );
}
