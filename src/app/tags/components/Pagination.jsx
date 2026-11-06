import Link from "next/link";
import classNames from "classnames";

import styles from "./pagination.module.scss";

function buildPageItems(currentPage, totalPages) {
  const clamp = n => Math.max(1, Math.min(totalPages, n));

  const wanted = [
    1,
    clamp(currentPage - 2),
    clamp(currentPage - 1),
    clamp(currentPage),
    clamp(currentPage + 1),
    clamp(currentPage + 2),
    totalPages,
  ];

  const pages = [...new Set(wanted)].sort((a, b) => a - b);

  const items = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const prev = pages[i - 1];

    if (i > 0 && page - prev > 1)
      items.push({ type: "ellipsis", key: `e-${prev}-${page}` });
    items.push({ type: "page", page, key: `p-${page}` });
  }

  return items;
}

export default function Pagination({ currentPage, totalPages, searchParams }) {
  if (totalPages <= 1) return null;

  const pageHref = page => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));
    return `/tags?${params}`;
  };

  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;
  const items = buildPageItems(currentPage, totalPages);

  return (
    <nav className={styles.pagination}>
      <Link
        href={pageHref(Math.max(1, currentPage - 1))}
        aria-disabled={isFirst}
        className={classNames(styles.link, { [styles.linkDisabled]: isFirst })}
        tabIndex={isFirst ? -1 : 0}
      >←</Link>

      {items.map(item => {
        if (item.type === "ellipsis")
          return <span key={item.key} className={styles.ellipsis}>…</span>;

        return <Link
          key={item.key}
          href={pageHref(item.page)}
          className={classNames(
            styles.link,
            { [styles.linkCurrent]: item.page === currentPage },
          )}
        >{item.page}</Link>;
      })}

      <Link
        href={pageHref(Math.min(totalPages, currentPage + 1))}
        aria-disabled={isLast}
        className={classNames(styles.link, { [styles.linkDisabled]: isLast })}
        tabIndex={isLast ? -1 : 0}
      >→</Link>
    </nav>
  );
}
