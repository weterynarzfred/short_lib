import db from "@/lib/db";

export async function updatePostTags(mediaId, rawTagString) {
  const tags = rawTagString
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);

  const trx = db.transaction(() => {
    const insertTag = db.prepare(`
      INSERT OR IGNORE INTO tags (name)
      VALUES (?)
    `);

    const selectTag = db.prepare(`
      SELECT id FROM tags WHERE name = ?
    `);

    const clearMediaTags = db.prepare(`
      DELETE FROM media_tags WHERE media_id = ?
    `);

    const insertMediaTag = db.prepare(`
      INSERT INTO media_tags (media_id, tag_id)
      VALUES (?, ?)
    `);

    clearMediaTags.run(mediaId);

    for (const name of tags) {
      insertTag.run(name);
      const { id } = selectTag.get(name);
      insertMediaTag.run(mediaId, id);
    }
  });

  trx();
}
