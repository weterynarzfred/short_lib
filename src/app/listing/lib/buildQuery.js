export const TAG_ORDER_SQL = `
  CASE t.type
    WHEN 'meta' THEN 0
    WHEN 'creator' THEN 1
    WHEN 'copyright' THEN 2
    WHEN 'character' THEN 3
    WHEN 'general' THEN 4
    ELSE 5
  END
`;

export default function buildQuery(parsed) {
  const { includeTags, excludeTags, filters } = parsed;

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
            ${TAG_ORDER_SQL},
            t.name COLLATE NOCASE
        ) t
      ), '[]') AS tags

    FROM media m
  `;

  let tagJoinIndex = 0;

  for (const tag of includeTags) {
    tagJoinIndex++;

    sql += `
      JOIN media_tags mt${tagJoinIndex}
        ON mt${tagJoinIndex}.media_id = m.id
      JOIN tags t${tagJoinIndex}
        ON t${tagJoinIndex}.id = mt${tagJoinIndex}.tag_id
       AND t${tagJoinIndex}.name = ?
    `;

    params.push(tag);
  }

  for (const tag of excludeTags) {
    where.push(`
      NOT EXISTS (
        SELECT 1
        FROM media_tags mt
        JOIN tags t ON t.id = mt.tag_id
        WHERE mt.media_id = m.id
          AND t.name = ?
      )
    `);
    params.push(tag);
  }

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

  if (where.length) {
    sql += " WHERE " + where.join(" AND ");
  }

  sql += `
    ORDER BY ${filters.orderBy}
    LIMIT ${filters.limit}
  `;

  return { sql, params };
}
