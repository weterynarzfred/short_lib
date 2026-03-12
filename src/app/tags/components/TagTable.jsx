"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import TagTableHeader from "./TagTableHeader";
import TagTableRow from "./TagTableRow";
import useTagTableEditor from "../lib/useTagTableEditor";
import { nextOrder } from "../lib/tagTableUtils";

import styles from "./TagTable.module.scss";

export default function TagTable({ tags, order }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const editor = useTagTableEditor({ tags });

  const createSortHref = useCallback((columnKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("order", nextOrder(order, columnKey));
    params.set("page", "1");
    return `${pathname}?${params.toString()}`;
  }, [searchParams, order, pathname]);

  return <>
    {editor.error && <p className={styles.error}>{editor.error}</p>}
    <table className={styles.table}>
      <TagTableHeader order={order} createSortHref={createSortHref} />
      <tbody>
        {tags.map(tag => (
          <TagTableRow
            key={tag.id}
            tag={tag}
            editor={editor}
          />
        ))}
      </tbody>
    </table>
  </>;
}
