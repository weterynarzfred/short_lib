import db from "@/lib/db";
import { findTagByAliasName } from "@/lib/tagAliases";

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
  WHERE id = ? AND type != ?
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

const getTransitiveImplications = db.prepare(`
  WITH RECURSIVE implied(id) AS (
    SELECT implied_tag_id FROM tag_implications WHERE tag_id = ?
    UNION
    SELECT ti.implied_tag_id FROM tag_implications ti JOIN implied i ON i.id = ti.tag_id
  )
  SELECT id FROM implied
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

// Alias lookup comes first so typing an alias never forks it into its own tag.
function resolveTag(name) {
  return findTagByAliasName(name) ?? selectTagByName.get(name) ?? null;
}

function resolveOrCreateTag({ name, providedType }) {
  const aliasTarget = findTagByAliasName(name);
  if (aliasTarget) return aliasTarget;

  insertTag.run(name, providedType);
  return selectTagByName.get(name) ?? null;
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

      const row = resolveTag(normalized.name);
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

    const baseTagIds = [];

    for (const tag of inputTags) {
      const normalized = normalizeInputTag(tag);
      if (!normalized) continue;

      const row = resolveOrCreateTag(normalized);
      if (!row) continue;

      if (normalized.providedType && row.type !== normalized.providedType)
        updateTagType.run(normalized.providedType, row.id, normalized.providedType);

      baseTagIds.push(row.id);
    }

    const allTagIds = new Set(baseTagIds);
    for (const tagId of baseTagIds) {
      for (const row of getTransitiveImplications.all(tagId)) {
        allTagIds.add(row.id);
      }
    }

    for (const tagId of allTagIds) {
      const linkResult = linkMediaTag.run(mid, tagId);
      if (linkResult.changes > 0) incrementTagPostCount.run(tagId);
    }
  });

  tx(safeMediaId, tags, replace);

}
