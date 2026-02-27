import Nav from "@/components/Nav";
import getTagStats from "./getTagStats";
import Pagination from "./Pagination";
import TagTable from "./TagTable";

import styles from "./page.module.scss";

export default async function TagStatsPage({ searchParams }) {
  const page = Number((await searchParams)?.page ?? 1);
  const limit = Number((await searchParams)?.limit ?? 20);
  const order = String((await searchParams)?.order ?? "count_desc");

  const { rows, total } = getTagStats({ page, limit, order });

  const safeLimit = Math.min(Math.max(limit || 50, 1), 200);
  const currentPage = Math.max(page || 1, 1);
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));

  return (
    <div className="page-tags">
      <Nav />
      <main className="content content--full">
        <h1>Tag stats</h1>
        <div className={styles.stats}>Total tags: {total}</div>
        <TagTable tags={rows} order={order} />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          searchParams={new URLSearchParams(await searchParams)}
        />
      </main>
    </div >
  );
}
