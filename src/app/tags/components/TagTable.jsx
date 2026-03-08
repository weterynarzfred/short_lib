"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";

import styles from "./TagTable.module.scss";

const columns = [
  { key: "name", label: "tag" },
  { key: "type", label: "type" },
  { key: "count", label: "posts" },
];

function nextOrder(currentOrder, columnKey) {
  const [currentKey, currentDir] = (currentOrder || "").split("_");
  if (currentKey !== columnKey) return `${columnKey}_desc`;
  return `${columnKey}_${currentDir === "asc" ? "desc" : "desc"}`;
}

export default function TagTable({ tags, order }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const createSortHref = (columnKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("order", nextOrder(order, columnKey));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <table className={styles.TagTable}>
      <thead>
        <tr>
          {columns.map((col) => {
            const isActive = order?.startsWith(col.key);
            const isAsc = order === `${col.key}_asc`;

            return (
              <th key={col.key}>
                <Link href={createSortHref(col.key)}>
                  {col.label}
                  {isActive && (isAsc ? " ▲" : " ▼")}
                </Link>
              </th>
            );
          })}
        </tr>
      </thead>

      <tbody>
        {tags.map(tag => (
          <tr key={tag.id}>
            <td>
              <Link href={`/listing?search=${encodeURIComponent(tag.name)}`}>
                {tag.name}
              </Link>
            </td>
            <td>{tag.type}</td>
            <td>{tag.post_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
