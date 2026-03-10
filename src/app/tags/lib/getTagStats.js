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

function normalizeFilter(value) {
  return String(value ?? "").trim();
}

export function getTagTypes() {
  const rows = db.prepare(`
    SELECT DISTINCT t.type
    FROM tags t
    WHERE TRIM(t.type) <> ''
    ORDER BY t.type COLLATE NOCASE ASC
  `).all();

  return rows.map(row => row.type).filter(Boolean);
}

export default function getTagStats({ page, limit, order, name, type } = {}) {
  const safeLimit = clampInt(limit, { min: 1, max: 200, fallback: 50 });
  const safePage = clampInt(page, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 1 });
  const offset = (safePage - 1) * safeLimit;
  const safeName = normalizeFilter(name);
  const safeType = normalizeFilter(type);

  const orderBy = ORDER_BY[order] ?? ORDER_BY.count_desc;
  const where = [];
  const whereParams = [];

  if (safeName) {
    where.push("t.name LIKE ? COLLATE NOCASE");
    whereParams.push(`%${safeName}%`);
  }

  if (safeType) {
    where.push("t.type = ?");
    whereParams.push(safeType);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS n
    FROM tags t
    ${whereSql}
  `).get(...whereParams);
  const total = totalRow?.n ?? 0;

  const stmt = db.prepare(`
    SELECT
      t.id,
      t.name,
      t.type,
      t.post_count
    FROM tags t
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(...whereParams, safeLimit, offset);
  return { total, rows };
}
