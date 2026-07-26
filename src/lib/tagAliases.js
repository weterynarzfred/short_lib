import db from "@/lib/db";

const selectTagByAliasName = db.prepare(`
  SELECT t.id, t.name, t.type
  FROM tag_aliases a
  JOIN tags t ON t.id = a.tag_id
  WHERE a.name = ?
`);

// Aliases point at a tag id and tags.name is always canonical, so one hop is enough.
export function findTagByAliasName(name) {
  const safeName = String(name ?? "").trim();
  if (!safeName) return null;

  return selectTagByAliasName.get(safeName) ?? null;
}

export function resolveTagName(name) {
  const safeName = String(name ?? "").trim();
  if (!safeName) return safeName;

  return findTagByAliasName(safeName)?.name ?? safeName;
}
