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

const insertTag = db.prepare(`
  INSERT INTO tags (name, type)
  VALUES (?, COALESCE(?, 'general'))
  ON CONFLICT(name) DO NOTHING
`);

const selectTagByName = db.prepare(`
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

const getMediaTagIds = db.prepare(`
  SELECT tag_id
  FROM media_tags
  WHERE media_id = ?
`);

const linkMediaTag = db.prepare(`
  INSERT OR IGNORE INTO media_tags (media_id, tag_id)
  VALUES (?, ?)
`);

const unlinkMediaTag = db.prepare(`
  DELETE FROM media_tags
  WHERE media_id = ? AND tag_id = ?
`);

const incrementTagPostCount = db.prepare(`
  UPDATE tags
  SET post_count = post_count + 1
  WHERE id = ?
`);

const decrementTagPostCount = db.prepare(`
  UPDATE tags
  SET post_count = CASE
    WHEN post_count > 0 THEN post_count - 1
    ELSE 0
  END
  WHERE id = ?
`);

function ensureMediaId(mediaId) {
  if (!mediaId) throw new Error("mediaId is required");
  return mediaId;
}

function normalizeInputTag(rawTag) {
  if (!rawTag?.name) return null;

  const name = String(rawTag.name).trim();
  if (!name) return null;

  const providedType =
    rawTag.type == null || String(rawTag.type).trim() === ""
      ? null
      : String(rawTag.type).trim();

  return { name, providedType };
}

function replaceMediaTags(mediaId) {
  const existing = getMediaTagIds.all(mediaId);
  for (const row of existing) decrementTagPostCount.run(row.tag_id);
  clearMediaTags.run(mediaId);
}

export function removeTags(mediaId, tags) {
  const safeMediaId = ensureMediaId(mediaId);

  const tx = db.transaction((mid, inputTags) => {
    if (!Array.isArray(inputTags) || inputTags.length === 0) return;

    for (const tag of inputTags) {
      const normalized = normalizeInputTag(tag);
      if (!normalized) continue;

      const row = selectTagByName.get(normalized.name);
      if (!row) continue;

      const unlinkResult = unlinkMediaTag.run(mid, row.id);
      if (unlinkResult.changes > 0) decrementTagPostCount.run(row.id);
    }
  });

  tx(safeMediaId, tags);
}

export default function addTags(mediaId, tags, { replace = false } = {}) {
  const safeMediaId = ensureMediaId(mediaId);

  const tx = db.transaction((mid, inputTags, shouldReplace) => {
    if (shouldReplace) replaceMediaTags(mid);
    if (!Array.isArray(inputTags) || inputTags.length === 0) return;

    for (const tag of inputTags) {
      const normalized = normalizeInputTag(tag);
      if (!normalized) continue;

      insertTag.run(normalized.name, normalized.providedType);

      const row = selectTagByName.get(normalized.name);
      if (!row) return;

      if (normalized.providedType && row.type !== normalized.providedType)
        updateTagType.run(normalized.providedType, normalized.name, normalized.providedType);

      const linkResult = linkMediaTag.run(mid, row.id);
      if (linkResult.changes > 0) incrementTagPostCount.run(row.id);
    }
  });

  tx(safeMediaId, tags, replace);
}
