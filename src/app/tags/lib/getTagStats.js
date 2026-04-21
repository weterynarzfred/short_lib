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
      t.post_count,
      t.description
    FROM tags t
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(...whereParams, safeLimit, offset);

  if (rows.length > 0) {
    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => "?").join(",");

    const aliases = db.prepare(`
      SELECT tag_id, name FROM tag_aliases WHERE tag_id IN (${placeholders})
    `).all(...ids);

    const implications = db.prepare(`
      SELECT ti.tag_id, t.id AS implied_id, t.name AS implied_name
      FROM tag_implications ti
      JOIN tags t ON t.id = ti.implied_tag_id
      WHERE ti.tag_id IN (${placeholders})
      ORDER BY t.name COLLATE NOCASE
    `).all(...ids);

    const aliasesByTagId = new Map(ids.map(id => [id, []]));
    for (const row of aliases) aliasesByTagId.get(row.tag_id)?.push(row.name);

    const implicationsByTagId = new Map(ids.map(id => [id, []]));
    for (const row of implications) {
      implicationsByTagId.get(row.tag_id)?.push({ id: row.implied_id, name: row.implied_name });
    }

    for (const row of rows) {
      row.aliases = aliasesByTagId.get(row.id) ?? [];
      row.implications = implicationsByTagId.get(row.id) ?? [];
    }
  }

  return { total, rows };
}
