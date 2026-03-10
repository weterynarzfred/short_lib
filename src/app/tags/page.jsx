import Nav from "@/components/Nav";
import getTagStats, { getTagTypes } from "./lib/getTagStats";
import Pagination from "./components/Pagination";
import TagTable from "./components/TagTable";
import TagFilters from "./components/TagFilters";

import styles from "./page.module.scss";

export default async function TagStatsPage({ searchParams }) {
  const params = await searchParams;
  const page = Number(params?.page ?? 1);
  const limit = Number(params?.limit ?? 50);
  const order = String(params?.order ?? "count_desc");
  const name = String(params?.name ?? "").trim();
  const type = String(params?.type ?? "").trim();

  const { rows, total } = getTagStats({ page, limit, order, name, type });
  const tagTypes = getTagTypes();

  const safeLimit = Math.min(Math.max(limit || 50, 1), 200);
  const currentPage = Math.max(page || 1, 1);
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));

  return (
    <div className="page-tags">
      <Nav />
      <main className="content content--full">
        <h1>Tag stats</h1>
        <TagFilters
          initialName={name}
          initialType={type}
          tagTypes={tagTypes}
        />

        <div className={styles.stats}>Total tags: {total}</div>
        <TagTable tags={rows} order={order} />
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          searchParams={new URLSearchParams(params)}
        />
      </main>
    </div >
  );
}
