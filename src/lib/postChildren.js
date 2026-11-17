import db from "@/lib/db";

const selectParentIdStmt = db.prepare("SELECT parent_id FROM media WHERE id = ?");
const selectChildIdsStmt = db.prepare("SELECT id FROM media WHERE parent_id = ?");
const selectChildrenStmt = db.prepare(`
  SELECT id, file_path, variants -> '$.thumb' AS thumb
  FROM media
  WHERE parent_id = ?
  ORDER BY child_position, id
`);
const clearChildrenStmt = db.prepare(`
  UPDATE media SET parent_id = NULL, child_position = NULL WHERE parent_id = ?
`);
const setParentStmt = db.prepare("UPDATE media SET parent_id = ?, child_position = ? WHERE id = ?");

// The same shape the listing query gives each post, so the panel can patch it in place.
function getFamilyFields(id) {
  return {
    id,
    parent_id: selectParentIdStmt.get(id)?.parent_id ?? null,
    children: selectChildrenStmt.all(id).map(child => ({ ...child, thumb: JSON.parse(child.thumb) })),
  };
}

// Replaces the children of `parentId` with `childIds`, in that order. Only one level deep:
// a child cannot have children, and a parent cannot be a child. A child taken from another
// parent is only moved with `reassign`; without it nothing changes and the conflicts come
// back for the user to confirm. Returns the fields of every post whose family changed.
export default function setPostChildren(parentId, childIds, { reassign = false } = {}) {
  const parent = selectParentIdStmt.get(parentId);
  if (!parent) throw new Error(`post ${parentId} does not exist`);
  if (childIds.length && parent.parent_id != null)
    throw new Error(`post ${parentId} is a child of ${parent.parent_id}`);

  const conflicts = [];
  for (const id of childIds) {
    if (id === parentId) throw new Error("a post cannot be its own child");

    const child = selectParentIdStmt.get(id);
    if (!child) throw new Error(`post ${id} does not exist`);
    if (selectChildIdsStmt.get(id)) throw new Error(`post ${id} has children of its own`);
    if (child.parent_id != null && child.parent_id !== parentId)
      conflicts.push({ id, parentId: child.parent_id });
  }

  if (conflicts.length && !reassign) return { conflicts, updates: [] };

  const affectedIds = new Set([
    parentId,
    ...childIds,
    ...selectChildIdsStmt.all(parentId).map(row => row.id),
    ...conflicts.map(conflict => conflict.parentId),
  ]);

  db.transaction(() => {
    clearChildrenStmt.run(parentId);
    childIds.forEach((id, index) => setParentStmt.run(parentId, index, id));
  })();

  return { conflicts: [], updates: [...affectedIds].map(getFamilyFields) };
}
