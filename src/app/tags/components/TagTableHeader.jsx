import Link from "next/link";

import { TAG_TABLE_COLUMNS } from "../lib/tagTableUtils";

export default function TagTableHeader({ order, createSortHref }) {
  return (
    <thead>
      <tr>
        {TAG_TABLE_COLUMNS.map(col => {
          if (col.key === "actions") return <th key={col.key}>{col.label}</th>;

          const isSort = order?.startsWith(col.key);
          const isAsc = order === `${col.key}_asc`;

          return <th key={col.key}>
            <Link href={createSortHref(col.key)}>
              {col.label}
              {isSort && (isAsc ? " ↑" : " ↓")}
            </Link>
          </th>;
        })}
      </tr>
    </thead>
  );
}
