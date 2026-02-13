import db from "@/lib/db";

export default function addTags(mediaId, tags) {
  if (!Array.isArray(tags) || tags.length === 0) return;

  const insertTag = db.prepare(`
    INSERT INTO tags (name, type)
    VALUES (?, COALESCE(?, 'general'))
    ON CONFLICT(name) DO NOTHING
  `);

  const updateTagType = db.prepare(`
    UPDATE tags
    SET type = ?
    WHERE name = ? AND type != ?
  `);

  const getTagId = db.prepare(`
    SELECT id, type FROM tags WHERE name = ?
  `);

  const linkMediaTag = db.prepare(`
    INSERT OR IGNORE INTO media_tags (media_id, tag_id)
    VALUES (?, ?)
  `);

  const tx = db.transaction((mediaId, tags) => {
    for (const tag of tags) {
      if (!tag?.name) continue;

      const name = tag.name.trim();
      const providedType = tag.type ?? null;

      insertTag.run(name, providedType);

      const existing = getTagId.get(name);

      if (providedType && existing.type !== providedType)
        updateTagType.run(providedType, name, providedType);

      linkMediaTag.run(mediaId, existing.id);
    }
  });

  tx(mediaId, tags);
}
