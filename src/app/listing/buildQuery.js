export default function buildQuery(parsed) {
  const { includeTags, excludeTags, filters } = parsed;

  const where = [];
  const params = [];

  let sql = `
    SELECT
      m.*,
      COALESCE(
        json_group_array(
          DISTINCT json_object(
            'id', t_all.id,
            'name', t_all.name,
            'type', t_all.type
          )
        ),
        '[]'
      ) AS tags
    FROM media m
    LEFT JOIN media_tags mt_all
      ON mt_all.media_id = m.id
    LEFT JOIN tags t_all
      ON t_all.id = mt_all.tag_id
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

  if (where.length) {
    sql += " WHERE " + where.join(" AND ");
  }

  sql += `
    GROUP BY m.id
    ORDER BY ${filters.order}
    LIMIT ${filters.limit}
  `;

  return { sql, params };
}
