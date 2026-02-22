import db from "@/lib/db";

export function parseTagString(raw = "") {
  return raw
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(token => {
      const idx = token.indexOf(":");
      if (idx > 0 && idx < token.length - 1) {
        const type = token.slice(0, idx).trim();
        const name = token.slice(idx + 1).trim();
        if (type && name) return { name, type };
      }
      return { name: token };
    });
}

export default function addTags(mediaId, tags, { replace = false } = {}) {
  if (!mediaId) throw new Error("mediaId is required");
  if (!Array.isArray(tags) || tags.length === 0) {
    if (replace)
      db.prepare(`DELETE FROM media_tags WHERE media_id = ?`).run(mediaId);
    return;
  }

  const insertTag = db.prepare(`
    INSERT INTO tags (name, type)
    VALUES (?, COALESCE(?, 'general'))
    ON CONFLICT(name) DO NOTHING
  `);

  const selectTag = db.prepare(`
    SELECT id, type FROM tags WHERE name = ?
  `);

  const updateTagType = db.prepare(`
    UPDATE tags
    SET type = ?
    WHERE name = ? AND type != ?
  `);

  const clearMediaTags = db.prepare(`
    DELETE FROM media_tags WHERE media_id = ?
  `);

  const linkMediaTag = db.prepare(`
    INSERT OR IGNORE INTO media_tags (media_id, tag_id)
    VALUES (?, ?)
  `);

  const tx = db.transaction((mid, inputTags) => {
    if (replace) clearMediaTags.run(mid);

    for (const tag of inputTags) {
      if (!tag?.name) continue;

      const name = String(tag.name).trim();
      if (!name) continue;

      const providedType =
        tag.type == null || String(tag.type).trim() === ""
          ? null
          : String(tag.type).trim();

      insertTag.run(name, providedType);

      const row = selectTag.get(name);

      if (providedType && row.type !== providedType)
        updateTagType.run(providedType, name, providedType);

      linkMediaTag.run(mid, row.id);
    }
  });

  tx(mediaId, tags);
}
