import Link from "next/link";

import Nav from "@/components/Nav";
import getTagStats from "./getTagStats";

export default async function TagStatsPage({ searchParams }) {
  const page = Number((await searchParams)?.page ?? 1);
  const limit = Number((await searchParams)?.limit ?? 5);
  const order = String((await searchParams)?.order ?? "count_desc");

  const { rows, total } = getTagStats({ page, limit, order });

  const safeLimit = Math.min(Math.max(limit || 50, 1), 200);
  const safePage = Math.max(page || 1, 1);
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));

  const makeHref = async nextPage => {
    const currentParams = new URLSearchParams(await searchParams);
    for (const [key, value] of Object.entries(nextPage)) {
      if (value === undefined || value === null || value === "") currentParams.delete(key);
      else currentParams.set(key, String(value));
    }
    console.log(`/tags?${currentParams.toString()}`);

    return `/tags?${currentParams.toString()}`;
  };

  return (
    <div className="page-tags">
      <Nav />
      <main className="content">
        <h1>Tag stats</h1>

        <div>
          <span>
            Total tags: {total} • Page {safePage} / {totalPages}
          </span>
        </div>

        <div>
          <Link href={await makeHref({ page: Math.max(1, safePage - 1) })} disabled={safePage <= 1}>
            Prev
          </Link>
          <Link href={await makeHref({ page: Math.min(totalPages, safePage + 1) })} disabled={safePage >= totalPages}>
            Next
          </Link>
        </div>

        <table>
          <thead>
            <tr>
              <th align="left">Tag</th>
              <th align="left">Type</th>
              <th align="right">Posts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/listing?search=${encodeURIComponent(t.name)}`}>
                    {t.name}
                  </Link>
                </td>
                <td>{t.type}</td>
                <td align="right">{t.post_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div >
  );
}
