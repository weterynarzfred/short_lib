import Link from "next/link";
import classNames from "classnames";

import styles from "./pagination.module.scss";

function buildPageItems({ currentPage, totalPages }) {
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

  const pages = Array.from(new Set(wanted))
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const items = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const prev = pages[i - 1];

    if (i > 0 && page - prev > 1)
      items.push({ type: "ellipsis", key: `e-${prev}-${page}` });
    items.push({ type: "page", page: page, key: `p-${page}` });
  }

  return items;
}

export default function Pagination({
  currentPage,
  totalPages,
  searchParams
}) {

  const makeHref = paramsChange => {
    for (const [key, value] of Object.entries(paramsChange)) {
      if (value === undefined || value === null || value === "") searchParams.delete(key);
      else searchParams.set(key, String(value));
    }
    return `/tags?${searchParams.toString()}`;
  };

  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;
  const items = buildPageItems({ currentPage, totalPages });
  if (!totalPages || totalPages <= 1) return null;

  return (
    <nav className={styles.pagination}>
      <Link
        href={makeHref({ page: Math.max(1, currentPage - 1) })}
        aria-disabled={isFirst}
        className={classNames(styles.link, { [styles.linkDisabled]: isFirst })}
        tabIndex={isFirst ? -1 : 0}
      >←</Link>

      {items.map(item => {
        if (item.type === "ellipsis")
          return <span key={item.key} className={styles.ellipsis}>…</span>;

        return <Link
          key={item.key}
          href={makeHref({ page: item.page })}
          className={classNames(
            styles.link,
            { [styles.linkCurrent]: item.page === currentPage },
          )}
        >{item.page}</Link>;
      })}

      <Link
        href={makeHref({ page: Math.min(totalPages, currentPage + 1) })}
        aria-disabled={isLast}
        className={classNames(styles.link, { [styles.linkDisabled]: isLast })}
        tabIndex={isLast ? -1 : 0}
      >→</Link>
    </nav>
  );
}
