import db from "@/lib/db";

export default function getTagStats({ page = 1, limit = 50, order = "count_desc" } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const orderBy =
    order === "name_asc" ? "t.name ASC" :
      order === "name_desc" ? "t.name DESC" :
        order === "count_asc" ? "post_count ASC, t.name ASC" :
    /* default */          "post_count DESC, t.name ASC";
  // TODO: turn this into something more sane

  const total = db.prepare(`SELECT COUNT(*) AS n FROM tags`).get().n;

  const rows = db.prepare(`
    SELECT
      t.id,
      t.name,
      t.type,
      COUNT(mt.media_id) AS post_count
    FROM tags t
    LEFT JOIN media_tags mt
      ON mt.tag_id = t.id
    GROUP BY t.id
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(safeLimit, offset);

  return {
    total,
    page: safePage,
    limit: safeLimit,
    rows,
  };
}
