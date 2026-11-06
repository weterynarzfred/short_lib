import Fuse from "fuse.js";

import db from "@/lib/db";

const TAG_FUSE_OPTIONS = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.4,
  keys: ["name"],
};

// Rebuilt per call rather than cached: the tag table is small, and a stale suggestion list
// right after renaming or adding a tag would be worse than the rebuild costs. Aliases join
// the same index, carrying the name they point at so choosing one inserts the real tag.
function buildTagsIndex() {
  const rows = db.prepare(`
    SELECT
      t.id,
      t.name,
      t.type,
      t.post_count AS postCount
    FROM tags t
    WHERE TRIM(COALESCE(t.name, '')) <> ''
    ORDER BY t.id ASC
  `).all();

  const aliasRows = db.prepare(`
    SELECT a.name AS aliasName, t.id, t.name AS realName, t.type, t.post_count AS postCount
    FROM tag_aliases a
    JOIN tags t ON t.id = a.tag_id
  `).all().map(row => ({
    id: row.id,
    name: row.aliasName,
    type: row.type,
    postCount: row.postCount,
    isAlias: true,
    realName: row.realName,
  }));

  const allRows = [...rows, ...aliasRows];
  return { rows: allRows, fuse: new Fuse(allRows, TAG_FUSE_OPTIONS) };
}

export async function searchTagSuggestions(query, { limit = 16 } = {}) {
  const safeQuery = String(query ?? "").trim();
  if (!/[\p{L}\p{N}]/u.test(safeQuery)) return [];

  const { rows: tagRows, fuse: tagsFuse } = buildTagsIndex();

  const normalizedQuery = safeQuery.toLowerCase();
  const overscan = Math.max(limit * 4, 32);

  const prefixMatches = tagRows
    .filter(row => row.name.toLowerCase().startsWith(normalizedQuery))
    .map(row => ({ item: row, score: 0 }));

  const fuzzyMatches = tagsFuse.search(safeQuery, { limit: overscan });

  const ranked = [...prefixMatches, ...fuzzyMatches]
    .sort((left, right) =>
      left.score - right.score
      || right.item.postCount - left.item.postCount
      || left.item.id - right.item.id);

  const seen = new Set();
  const suggestions = [];

  for (const { item: tag } of ranked) {
    const name = tag.name.trim();
    if (seen.has(tag.id)) continue;

    seen.add(tag.id);
    suggestions.push({
      id: tag.id,
      name: tag.isAlias ? `${name} → ${tag.realName}` : name,
      insertName: tag.isAlias ? tag.realName : undefined,
      matchName: tag.isAlias ? name : undefined,
      type: tag.type,
      postCount: tag.postCount,
    });

    if (suggestions.length >= limit) break;
  }

  return suggestions;
}
