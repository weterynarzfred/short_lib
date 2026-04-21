import db from "@/lib/db";

function toSafeTagId(tagId) {
  const parsed = Number(tagId);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error("Invalid tag id");
  return parsed;
}

function normalizeTagName(name) {
  const next = String(name ?? "").trim();
  if (!next) throw new Error("Tag name is required");
  return next;
}

function normalizeTagType(type) {
  const next = String(type ?? "").trim();
  return next || "general";
}

function getTagById(id) {
  return db.prepare(`
    SELECT id, name, type
    FROM tags
    WHERE id = ?
  `).get(id);
}

function getTagByName(name) {
  return db.prepare(`
    SELECT id, name, type
    FROM tags
    WHERE name = ?
  `).get(name);
}

function updateType(id, type) {
  db.prepare(`
    UPDATE tags
    SET type = ?
    WHERE id = ?
  `).run(type, id);
}

function updateNameAndType(id, name, type) {
  db.prepare(`
    UPDATE tags
    SET name = ?, type = ?
    WHERE id = ?
  `).run(name, type, id);
}

function moveLinks(fromId, toId) {
  return db.prepare(`
    INSERT OR IGNORE INTO media_tags (media_id, tag_id)
    SELECT media_id, ?
    FROM media_tags
    WHERE tag_id = ?
  `).run(toId, fromId).changes;
}

function deleteTag(id) {
  db.prepare(`
    DELETE FROM tags
    WHERE id = ?
  `).run(id);
}

function incrementTagPostCount(id, by = 1) {
  db.prepare(`
    UPDATE tags
    SET post_count = post_count + ?
    WHERE id = ?
  `).run(by, id);
}

function applyUpdate(source, desiredType) {
  if (source.type !== desiredType) updateType(source.id, desiredType);
  return { mode: "updated", id: source.id };
}

function applyRename(id, name, type) {
  updateNameAndType(id, name, type);
  return { mode: "renamed", id };
}

function applyMerge(sourceId, target) {
  const movedCount = moveLinks(sourceId, target.id);
  if (movedCount > 0) incrementTagPostCount(target.id, movedCount);
  deleteTag(sourceId);
  return { mode: "merged", id: target.id };
}

export function updateTagDescription(tagId, description) {
  const id = toSafeTagId(tagId);
  const value = description == null || String(description).trim() === "" ? null : String(description);
  db.prepare(`UPDATE tags SET description = ? WHERE id = ?`).run(value, id);
}

export function addTagAlias(tagId, aliasName) {
  const id = toSafeTagId(tagId);
  const name = String(aliasName ?? "").trim();
  if (!name) throw new Error("Alias name is required");
  const conflict = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(name);
  if (conflict) throw new Error(`"${name}" is already a tag name`);
  db.prepare(`INSERT INTO tag_aliases (name, tag_id) VALUES (?, ?)`).run(name, id);
}

export function removeTagAlias(aliasName) {
  const name = String(aliasName ?? "").trim();
  db.prepare(`DELETE FROM tag_aliases WHERE name = ?`).run(name);
}

export function addTagImplicationByName(tagId, impliedTagName) {
  const id = toSafeTagId(tagId);
  const name = String(impliedTagName ?? "").trim();
  if (!name) throw new Error("Tag name is required");
  const impliedTag = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(name);
  if (!impliedTag) throw new Error(`Tag "${name}" not found`);
  if (id === impliedTag.id) throw new Error("Tag cannot imply itself");
  db.prepare(`INSERT OR IGNORE INTO tag_implications (tag_id, implied_tag_id) VALUES (?, ?)`).run(id, impliedTag.id);
}

export function removeTagImplication(tagId, impliedTagId) {
  const id = toSafeTagId(tagId);
  const impliedId = toSafeTagId(impliedTagId);
  db.prepare(`DELETE FROM tag_implications WHERE tag_id = ? AND implied_tag_id = ?`).run(id, impliedId);
}

export function updateTagById(tagId, { name, type } = {}) {
  const id = toSafeTagId(tagId);
  const desiredName = normalizeTagName(name);
  const desiredType = normalizeTagType(type);

  const tx = db.transaction((id, name, type) => {
    const sourceTag = getTagById(id);
    if (!sourceTag) throw new Error("Tag not found");
    if (sourceTag.name === name) return applyUpdate(sourceTag, type);

    const conflictingPreexistingTag = getTagByName(name);
    if (!conflictingPreexistingTag) return applyRename(id, name, type);
    return applyMerge(id, conflictingPreexistingTag);
  });

  return tx(id, desiredName, desiredType);
}

export function deleteTagById(tagId) {
  const safeId = toSafeTagId(tagId);
  const result = db.prepare(`
    DELETE FROM tags
    WHERE id = ?
  `).run(safeId);
  return result.changes > 0;
}
