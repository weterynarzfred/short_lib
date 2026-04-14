import Fuse from "fuse.js";

import db from "@/lib/db";

const TAG_FUSE_OPTIONS = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.4,
  keys: ["name"],
};

const NOTES_FUSE_OPTIONS = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.35,
  keys: ["notesMd"],
};

let mediaNotesDirty = true;
let mediaNotesRows = [];
let mediaNotesFuse = null;

function splitTerms(raw = "") {
  return String(raw)
    .trim()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
}

function normalizeScore(score) {
  return Number.isFinite(score) ? score : 1;
}

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

  return { rows, fuse: new Fuse(rows, TAG_FUSE_OPTIONS) };
}

function rebuildMediaNotesIndex() {
  mediaNotesRows = db.prepare(`
    SELECT
      m.id AS mediaId,
      m.notes_md AS notesMd
    FROM media m
    WHERE TRIM(COALESCE(m.notes_md, '')) <> ''
    ORDER BY m.id ASC
  `).all();

  mediaNotesFuse = new Fuse(mediaNotesRows, NOTES_FUSE_OPTIONS);
  mediaNotesDirty = false;
}

function ensureMediaNotesIndex() {
  if (!mediaNotesDirty && mediaNotesFuse) return;
  rebuildMediaNotesIndex();
}

export function markMediaNotesIndexDirty() {
  mediaNotesDirty = true;
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
    suggestions.push({
      id,
      name,
      type: String(tag?.type ?? "general"),
      postCount: Number(tag?.postCount) || 0,
    });

    if (suggestions.length >= safeLimit) break;
  }

  return suggestions;
}

export async function searchMediaIdsByNotes(query, { limit = 5000 } = {}) {
  const safeQuery = String(query ?? "").trim();
  if (!safeQuery) return [];

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 10000) : 5000;
  const terms = splitTerms(safeQuery);
  if (!terms.length) return [];

  ensureMediaNotesIndex();
  if (!mediaNotesRows.length) return [];

  const rankedById = new Map();
  const overscan = Math.max(mediaNotesRows.length, safeLimit);

  for (const term of terms) {
    const hits = mediaNotesFuse.search(term, { limit: overscan });
    for (const hit of hits) {
      const mediaId = Number(hit?.item?.mediaId);
      if (!Number.isInteger(mediaId) || mediaId <= 0) continue;

      const existing = rankedById.get(mediaId);
      const score = normalizeScore(hit?.score);

      if (!existing) {
        rankedById.set(mediaId, {
          mediaId,
          matches: 1,
          score,
        });
        continue;
      }

      existing.matches += 1;
      existing.score += score;
    }
  }

  return [...rankedById.values()]
    .filter(row => row.matches === terms.length)
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      return left.mediaId - right.mediaId;
    })
    .slice(0, safeLimit)
    .map(row => row.mediaId);
}
