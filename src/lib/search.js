import Fuse from "fuse.js";

import db from "@/lib/db";

// includeMatches gives character ranges, which is what lets the listing show the matched
// fragment of a long note rather than just its opening.
const NOTES_FUSE_OPTIONS = {
  includeScore: true,
  includeMatches: true,
  ignoreLocation: true,
  threshold: 0.35,
  keys: ["notesMd"],
};

// Tighter than notes: 0.35 floods this corpus with false positives (a search for "512"
// matched 337 of 1573 files), while 0.2 is too strict to forgive a typo.
const FILENAME_FUSE_OPTIONS = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.3,
  keys: ["searchText"],
};

const FILENAME_EXTENSION = /\.[a-z0-9]{1,5}$/i;
const FILENAME_SEPARATORS = /[_+\-.]+/g;
const NUMERIC_TERM = /^\d+$/;

// Both text indexes are the same shape - rows read once, rebuilt when something edits
// them - so they share one holder rather than two copies of the dirty-flag dance.
function createIndex({ read, fuseOptions }) {
  let rows = [];
  let fuse = null;
  let isDirty = true;

  return {
    get() {
      if (isDirty || !fuse) {
        rows = read();
        fuse = new Fuse(rows, fuseOptions);
        isDirty = false;
      }

      return { rows, fuse };
    },
    markDirty() {
      isDirty = true;
    },
  };
}

// Separators become spaces so a filename typed with a space still matches
// "Koreans+gaming_176287.mp4". The extension is dropped: it matches on hundreds of files
// at once and mime_type: is the proper way to filter by file type.
function normalizeFilenameForSearch(originalFilename) {
  return String(originalFilename ?? "")
    .replace(FILENAME_EXTENSION, "")
    .replace(FILENAME_SEPARATORS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

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

function clampSearchLimit(limit) {
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 10000) : 5000;
}

// Fuse reports one inclusive [start, end] pair per contiguous run of matched characters,
// and a fuzzy match scatters plenty of incidental ones. Taking the first pair highlighted
// "[o]ffice chair jousting" for a search of "jousting"; taking the longest highlighted
// "f[ramerates]" for "race", because a loose run can be longer than the real word. The run
// closest in length to the term wins, which lands on the word itself.
function bestMatchRange(hit, term) {
  const indices = hit?.matches?.[0]?.indices;
  if (!Array.isArray(indices) || !indices.length) return null;

  const wanted = String(term ?? "").length;
  let best = null;
  let bestDistance = Infinity;

  for (const pair of indices) {
    if (!Array.isArray(pair) || pair.length < 2) continue;

    const [start, end] = pair;
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) continue;

    const length = end - start + 1;
    const distance = Math.abs(length - wanted);
    // Ties go to the longer run, which carries more context.
    if (distance < bestDistance || (distance === bestDistance && length > best.end - best.start + 1)) {
      best = { start, end };
      bestDistance = distance;
    }
  }

  return best;
}

const notesIndex = createIndex({
  fuseOptions: NOTES_FUSE_OPTIONS,
  read: () => db.prepare(`
    SELECT
      m.id AS mediaId,
      m.notes_md AS notesMd
    FROM media m
    WHERE TRIM(COALESCE(m.notes_md, '')) <> ''
    ORDER BY m.id ASC
  `).all(),
});

const filenameIndex = createIndex({
  fuseOptions: FILENAME_FUSE_OPTIONS,
  read: () => db.prepare(`
    SELECT
      m.id AS mediaId,
      m.original_filename AS originalFilename
    FROM media m
    WHERE TRIM(COALESCE(m.original_filename, '')) <> ''
    ORDER BY m.id ASC
  `).all()
    .map(row => ({
      mediaId: row.mediaId,
      searchText: normalizeFilenameForSearch(row.originalFilename),
    }))
    .filter(row => row.searchText),
});

export function markMediaNotesIndexDirty() {
  notesIndex.markDirty();
}

// Unlike notes, filenames are written on upload as well as on edit, so both paths have to
// invalidate or a freshly uploaded file stays unfindable by text:.
export function markMediaFilenamesIndexDirty() {
  filenameIndex.markDirty();
}

// Lower is better, matching Fuse's convention. An exact whole-value match scores 0; past
// that, a match covering more of the filename beats a fragment buried in a long id, and an
// earlier match breaks the tie. Without this every substring hit scored 0 and ranking fell
// back to insertion order, so "512" put 512.jpg wherever its id happened to land.
function substringScore(searchText, term) {
  const index = searchText.indexOf(term);
  if (index < 0) return null;

  const coverage = term.length / searchText.length;
  const position = index / searchText.length;

  return (1 - coverage) * 0.8 + position * 0.2;
}

// Every term must match, and a row's score is the sum across terms. `searchTerm` returns
// `{ mediaId, score, range }` per hit, which lets a caller mix matchers per term. Every
// term's range is kept so a multi-term search can mark each word it found, ordered
// best-scoring first so the snippet centres on the strongest match.
function rankByAllTerms(terms, searchTerm, limit) {
  const rankedById = new Map();

  for (const term of terms) {
    for (const { mediaId, score, range } of searchTerm(term)) {
      if (!Number.isInteger(mediaId) || mediaId <= 0) continue;

      const hit = range ? [{ range, score }] : [];
      const existing = rankedById.get(mediaId);
      if (!existing) {
        rankedById.set(mediaId, { mediaId, matches: 1, score, rangeHits: hit });
        continue;
      }

      existing.matches += 1;
      existing.score += score;
      existing.rangeHits.push(...hit);
    }
  }

  return [...rankedById.values()]
    .filter(row => row.matches === terms.length)
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      return left.mediaId - right.mediaId;
    })
    .slice(0, limit)
    .map(({ rangeHits, ...row }) => ({
      ...row,
      ranges: rangeHits
        .sort((left, right) => left.score - right.score)
        .map(entry => entry.range),
    }));
}

// Both matchers return `{ mediaId, score, field, ranges }` in rank order. `field` says
// which text matched so the listing can show the right thing, and `ranges` locate the
// matched words within it, for notes only.
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

// A post matches when all terms are found in its notes, or all in its filename. Letting
// terms split across the two fields would pair a real note hit with an accidental
// filename hit, which is how false positives creep in.
//
// The two rankings are merged on score rather than concatenated: appending one after the
// other buried an exact filename match under loose note matches. Both matchers score
// 0 (best) to 1, so the scales are comparable enough to interleave.
export async function searchMediaMatchesByText(query, { limit = 5000 } = {}) {
  const safeLimit = clampSearchLimit(limit);

  const [noteRows, filenameRows] = await Promise.all([
    searchMediaMatchesByNotes(query, { limit: safeLimit }),
    searchMediaMatchesByFilename(query, { limit: safeLimit }),
  ]);

  // Keeping the better-scoring row also keeps its field, so a post matching both shows
  // whichever text actually explains the hit.
  const bestByMediaId = new Map();
  for (const row of [...noteRows, ...filenameRows]) {
    const existing = bestByMediaId.get(row.mediaId);
    if (!existing || row.score < existing.score) bestByMediaId.set(row.mediaId, row);
  }

  return [...bestByMediaId.values()]
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      return left.mediaId - right.mediaId;
    })
    .slice(0, safeLimit);
}
