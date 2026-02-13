export default function buildQuery(parsed) {
  const { includeTags, excludeTags, filters } = parsed;

  const where = [];
  const params = [];

  let sql = `
    SELECT DISTINCT m.*
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

  if (filters.type) {
    where.push("m.type = ?");
    params.push(filters.type);
  }

  if (where.length) {
    sql += " WHERE " + where.join(" AND ");
  }

  sql += ` ORDER BY ${filters.order}`;
  sql += ` LIMIT ${filters.limit}`;

  return { sql, params };
}
