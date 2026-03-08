import db from "@/lib/db";

const clampInt = (value, { min, max, fallback }) => {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

const ORDER_BY = {
  name_asc: "t.name ASC, t.id ASC",
  name_desc: "t.name DESC, t.id ASC",

  type_asc: "t.type ASC, t.name ASC, t.id ASC",
  type_desc: "t.type DESC, t.name ASC, t.id ASC",

  count_asc: "post_count ASC, t.name ASC, t.id ASC",
  count_desc: "post_count DESC, t.name ASC, t.id ASC",
};

export default function getTagStats({ page, limit, order } = {}) {
  const safeLimit = clampInt(limit, { min: 1, max: 200, fallback: 50 });
  const safePage = clampInt(page, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 1 });
  const offset = (safePage - 1) * safeLimit;

  const orderBy = ORDER_BY[order] ?? ORDER_BY.count_desc;

  const totalRow = db.prepare(`SELECT COUNT(*) AS n FROM tags`).get();
  const total = totalRow?.n ?? 0;

  const stmt = db.prepare(`
    SELECT
      t.id,
      t.name,
      t.type,
      COUNT(mt.media_id) AS post_count
    FROM tags t
    LEFT JOIN media_tags mt
      ON mt.tag_id = t.id
    GROUP BY t.id, t.name, t.type
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(safeLimit, offset);
  return { total, rows };
}
