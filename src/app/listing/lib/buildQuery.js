import { buildTagTypeOrderSql } from "@/lib/tagTypeOrder";

export const TAG_ORDER_SQL = buildTagTypeOrderSql();

function clampInt(value, { min, max, fallback }) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function buildTagPredicate(node, params) {
  if (!node) return null;

  if (node.type === "TAG") {
    params.push(node.name);

    const existsClause = `
      EXISTS (
        SELECT 1
        FROM media_tags mt
        JOIN tags t ON t.id = mt.tag_id
        WHERE mt.media_id = m.id
          AND t.name = ?
      )
    `;

    if (node.negated) return `NOT ${existsClause}`;
    return existsClause;
  }

  if (node.type === "AND" || node.type === "OR") {
    const left = buildTagPredicate(node.left, params);
    const right = buildTagPredicate(node.right, params);

    if (!left) return right;
    if (!right) return left;

    return `(${left} ${node.type} ${right})`;
  }

  return null;
}

function buildHasPredicate(hasFilter, params) {
  const value = hasFilter?.value;
  if (!value) return null;

  if (value === "notes") {
    if (hasFilter.negated) return `COALESCE(TRIM(m.notes_md), '') = ''`;
    return `COALESCE(TRIM(m.notes_md), '') <> ''`;
  }

  params.push(value);

  const existsClause = `
    EXISTS (
      SELECT 1
      FROM media_tags mt
      JOIN tags t ON t.id = mt.tag_id
      WHERE mt.media_id = m.id
        AND LOWER(t.type) = ?
    )
  `;

  if (hasFilter.negated) return `NOT ${existsClause}`;
  return existsClause;
}

export default function buildQuery(parsed, { limit, offset, tagOrderSql = TAG_ORDER_SQL } = {}) {
  const { filters, tagExpression } = parsed;
  const safeLimit = clampInt(limit ?? filters.limit, {
    min: 1,
    max: 500,
    fallback: 100,
  });
  const safeOffset = clampInt(offset, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    fallback: 0,
  });

  const where = [];
  const params = [];

  let sql = `
    SELECT
      m.*,

      (
        SELECT COUNT(*)
        FROM media_tags mt
        WHERE mt.media_id = m.id
      ) AS tag_count,

      COALESCE((
        SELECT json_group_array(
          json_object(
            'id', t.id,
            'name', t.name,
            'type', t.type
          )
        )
        FROM (
          SELECT t.id, t.name, t.type
          FROM media_tags mt
          JOIN tags t ON t.id = mt.tag_id
          WHERE mt.media_id = m.id
          ORDER BY
            ${tagOrderSql},
            t.name COLLATE NOCASE
        ) t
      ), '[]') AS tags

    FROM media m
  `;

  const tagPredicate = buildTagPredicate(tagExpression, params);
  if (tagPredicate) where.push(tagPredicate);

  if (filters.mimeTypes.length) {
    const placeholders = filters.mimeTypes.map(() => "?").join(", ");
    where.push(`LOWER(m.mime_type) IN (${placeholders})`);
    params.push(...filters.mimeTypes);
  }

  if (filters.fileSize) {
    where.push(`m.file_size ${filters.fileSize.op} ?`);
    params.push(filters.fileSize.value);
  }

  if (filters.age) {
    where.push(`(unixepoch() * 1000 - (? * 1000)) ${filters.age.op} m.created_at`);
    params.push(filters.age.value);
  }

  if (filters.mpixels) {
    where.push(`(CAST(m.width AS REAL) * CAST(m.height AS REAL)) ${filters.mpixels.op} ?`);
    params.push(filters.mpixels.value);
  }

  if (filters.duration) {
    where.push(`m.duration_ms ${filters.duration.op} ?`);
    params.push(filters.duration.value);
  }

  if (filters.imageRatio) {
    where.push(`
      m.width IS NOT NULL
      AND m.height IS NOT NULL
      AND m.height > 0
      AND (CAST(m.width AS REAL) / m.height) ${filters.imageRatio.op} ?
    `);
    params.push(filters.imageRatio.value);
  }

  if (Array.isArray(filters.has) && filters.has.length) {
    for (const hasFilter of filters.has) {
      const hasPredicate = buildHasPredicate(hasFilter, params);
      if (hasPredicate) where.push(hasPredicate);
    }
  }

  if (filters.notes) {
    where.push(`
      m.id IN (
        SELECT rowid
        FROM media_notes_fts
        WHERE media_notes_fts MATCH ?
      )
    `);
    params.push(filters.notes);
  }

  if (where.length) {
    sql += " WHERE " + where.join(" AND ");
  }

  sql += `
    ORDER BY ${filters.orderBy}
    LIMIT ${safeLimit}
    OFFSET ${safeOffset}
  `;

  return { sql, params };
}
