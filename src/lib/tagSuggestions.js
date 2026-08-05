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

function normalizeScore(score) {
  return Number.isFinite(score) ? score : 1;
}

export async function searchTagSuggestions(query, { limit = 16 } = {}) {
  const safeQuery = String(query ?? "").trim();
  if (!safeQuery) return [];
  if (!/[\p{L}\p{N}]/u.test(safeQuery)) return [];

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 16;
  const { rows: tagRows, fuse: tagsFuse } = buildTagsIndex();
  if (!tagRows.length) return [];

  const normalizedQuery = safeQuery.toLowerCase();
  const overscan = Math.max(safeLimit * 4, 32);

  const prefixMatches = tagRows
    .filter(row => String(row.name ?? "").toLowerCase().startsWith(normalizedQuery))
    .map(row => ({ item: row, score: 0 }));

  const fuzzyMatches = tagsFuse.search(safeQuery, { limit: overscan });

  const ranked = [...prefixMatches, ...fuzzyMatches]
    .sort((left, right) => {
      const leftScore = normalizeScore(left.score);
      const rightScore = normalizeScore(right.score);
      if (leftScore !== rightScore) return leftScore - rightScore;

      const leftPostCount = Number(left.item?.postCount) || 0;
      const rightPostCount = Number(right.item?.postCount) || 0;
      if (leftPostCount !== rightPostCount) return rightPostCount - leftPostCount;

      return Number(left.item?.id) - Number(right.item?.id);
    });

  const seen = new Set();
  const suggestions = [];

  for (const result of ranked) {
    const tag = result?.item;
    const id = Number(tag?.id);
    const name = String(tag?.name ?? "").trim();
    if (!Number.isInteger(id) || !name || seen.has(id)) continue;

    seen.add(id);
    const isAlias = tag?.isAlias === true;
    suggestions.push({
      id,
      name: isAlias ? `${name} → ${tag.realName}` : name,
      insertName: isAlias ? tag.realName : undefined,
      matchName: isAlias ? name : undefined,
      type: String(tag?.type ?? "general"),
      postCount: Number(tag?.postCount) || 0,
    });

    if (suggestions.length >= safeLimit) break;
  }

  return suggestions;
}

export async function searchMediaMatchesByNotes(query, { limit = 5000 } = {}) {
  const safeQuery = String(query ?? "").trim();
  if (!safeQuery) return [];

  const safeLimit = clampSearchLimit(limit);
  const terms = splitTerms(safeQuery);
  if (!terms.length) return [];

  const { rows, fuse } = notesIndex.get();
  if (!rows.length) return [];

  const overscan = Math.max(rows.length, safeLimit);

  return rankByAllTerms(terms, term =>
    fuse.search(term, { limit: overscan }).map(hit => ({
      mediaId: Number(hit?.item?.mediaId),
      score: normalizeScore(hit?.score),
      range: bestMatchRange(hit, term),
    })), safeLimit).map(row => ({ ...row, field: "notes" }));
}

export async function searchMediaMatchesByFilename(query, { limit = 5000 } = {}) {
  const safeQuery = String(query ?? "").trim();
  if (!safeQuery) return [];

  const safeLimit = clampSearchLimit(limit);
  const terms = splitTerms(safeQuery).map(term => term.toLowerCase());
  if (!terms.length) return [];

  const { rows, fuse } = filenameIndex.get();
  if (!rows.length) return [];

  const overscan = Math.max(rows.length, safeLimit);

  return rankByAllTerms(terms, term => {
    // Digits in these filenames are ids, pasted or half-remembered exactly. Fuzzy
    // matching them mostly finds a different number - "2026" fuzzily matched 55 files
    // that do not contain it anywhere.
    if (NUMERIC_TERM.test(term)) {
      return rows
        .map(row => ({ mediaId: row.mediaId, score: substringScore(row.searchText, term) }))
        .filter(row => row.score !== null);
    }

    return fuse.search(term, { limit: overscan }).map(hit => ({
      mediaId: Number(hit?.item?.mediaId),
      score: normalizeScore(hit?.score),
    }));
    // No range: filenames are short enough to show whole, so there is nothing to window.
  }, safeLimit).map(row => ({ ...row, field: "filename", ranges: [] }));
}
