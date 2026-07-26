import db from "@/lib/db";

// Full transitive closure of the implication graph, every tag at once. UNION rather than
// UNION ALL, so a cycle de-duplicates and terminates instead of looping.
const CLOSURE_CTE = `
  WITH RECURSIVE closure(tag_id, implied_id) AS (
    SELECT tag_id, implied_tag_id FROM tag_implications
    UNION
    SELECT c.tag_id, ti.implied_tag_id
    FROM closure c
    JOIN tag_implications ti ON ti.tag_id = c.implied_id
  )
`;

// Read separately from the insert rather than as INSERT ... SELECT FROM media_tags, which
// would read and write the same table in one statement. It also makes the result countable.
const selectMissingLinks = db.prepare(`
  ${CLOSURE_CTE}
  SELECT DISTINCT mt.media_id AS mediaId, c.implied_id AS tagId
  FROM media_tags mt
  JOIN closure c ON c.tag_id = mt.tag_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM media_tags existing
    WHERE existing.media_id = mt.media_id
      AND existing.tag_id = c.implied_id
  )
`);

const linkMediaTag = db.prepare(`
  INSERT OR IGNORE INTO media_tags (media_id, tag_id)
  VALUES (?, ?)
`);

// A bulk insert cannot report how many rows landed per tag, so affected counts are
// recomputed rather than incremented.
const recountTag = db.prepare(`
  UPDATE tags
  SET post_count = (SELECT COUNT(*) FROM media_tags WHERE tag_id = tags.id)
  WHERE id = ?
`);

// Adds every link the implication graph requires but that does not exist yet, across the
// whole library. Idempotent: a second run finds nothing.
//
// Deliberately global rather than scoped to one edge. Implications have only ever applied
// at write time, so a tag added before its implication existed never received it - this
// repairs that drift too, and it avoids needing a reverse walk to work out which posts a
// newly added edge affects.
export default function applyTagImplications() {
  const apply = db.transaction(() => {
    const missing = selectMissingLinks.all();
    if (!missing.length) return { linksAdded: 0, tagsUpdated: 0 };

    const touchedTagIds = new Set();
    let linksAdded = 0;

    for (const { mediaId, tagId } of missing) {
      const result = linkMediaTag.run(mediaId, tagId);
      if (result.changes > 0) {
        linksAdded += result.changes;
        touchedTagIds.add(tagId);
      }
    }

    for (const tagId of touchedTagIds) recountTag.run(tagId);

    return { linksAdded, tagsUpdated: touchedTagIds.size };
  });

  return apply();
}
