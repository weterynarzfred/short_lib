"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./Search.module.scss";

export default function Search({ initialValue = "" }) {
  const [value, setValue] = useState(initialValue);
  const router = useRouter();

  useEffect(() => {
    const id = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);

      if (value) params.set("search", value);
      else params.delete("search");

      router.replace(`?${params.toString()}`);
    }, 300);

    return () => clearTimeout(id);
  }, [value, router]);

  return (
    <div className={styles.Search}>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Search…"
      />
    </div>
  );
}
