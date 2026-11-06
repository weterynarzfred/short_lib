import { buildTagTypeOrderSql } from "@/lib/tagTypeOrder";

const TAG_ORDER_SQL = buildTagTypeOrderSql();

// A comparison against a column that can be NULL is NULL, and NOT NULL is still NULL - so
// a naive negation quietly drops rows with no value. Coalescing the comparison itself to
// false makes negation total: `-duration:>60s` includes media with no duration at all.
function negatable(predicate, negated) {
  return negated ? `NOT COALESCE(${predicate}, 0)` : predicate;
}

function comparison(expression, { op, value }, negated, params) {
  params.push(value);

  return negatable(`${expression} ${op} ?`, negated);
}

const MPIXELS_SQL = "(CAST(m.width AS REAL) * CAST(m.height AS REAL))";
const IMAGE_RATIO_SQL = `
  CASE
    WHEN m.width IS NOT NULL AND m.height IS NOT NULL AND m.height > 0
      THEN CAST(m.width AS REAL) / m.height
    ELSE NULL
  END
`;

function buildTermPredicate(node, params) {
  switch (node.kind) {
    case "tag": {
      params.push(node.name);
      const exists = `
        EXISTS (
          SELECT 1
          FROM media_tags mt
          JOIN tags t ON t.id = mt.tag_id
          WHERE mt.media_id = m.id
            AND t.name = ?
        )
      `;

      return node.negated ? `NOT ${exists}` : exists;
    }

    case "mime_type":
      params.push(node.value);
      return negatable("LOWER(m.mime_type) = ?", node.negated);

    case "file_size":
      return comparison("m.file_size", node.comparison, node.negated, params);

    case "age":
      // Older than N means created before the cutoff, so the column sits on the right.
      params.push(node.comparison.value);
      return negatable(
        `(unixepoch() * 1000 - (? * 1000)) ${node.comparison.op} m.created_at`,
        node.negated
      );

    case "mpixels":
      return comparison(MPIXELS_SQL, node.comparison, node.negated, params);

    case "duration":
      return comparison("m.duration_ms", node.comparison, node.negated, params);

    case "score":
      return comparison("COALESCE(m.score, 0)", node.comparison, node.negated, params);

    case "image_ratio":
      return comparison(IMAGE_RATIO_SQL, node.comparison, node.negated, params);

    case "has":
      return buildHasPredicate(node, params);

    case "notes":
    case "text":
    case "filename":
    case "similar":
      return buildResolvedIdsPredicate(node, params);
  }
}

function buildPredicate(node, params) {
  if (!node) return null;

  if (node.type === "TERM") return buildTermPredicate(node, params);

  const left = buildPredicate(node.left, params);
  const right = buildPredicate(node.right, params);

  if (!left) return right;
  if (!right) return left;

  return `(${left} ${node.type} ${right})`;
}

function buildHasPredicate({ value, negated }, params) {
  if (value === "notes") {
    if (negated) return `COALESCE(TRIM(m.notes_md), '') = ''`;
    return `COALESCE(TRIM(m.notes_md), '') <> ''`;
  }

  // 0 and unrated are the same thing, so -has:score means "score is zero".
  if (value === "score") {
    if (negated) return `COALESCE(m.score, 0) = 0`;
    return `COALESCE(m.score, 0) > 0`;
  }

  params.push(value);

  const existsClause = `
    EXISTS (
      SELECT 1
      FROM media_tags mt
      JOIN tags t ON t.id = mt.tag_id
      WHERE mt.media_id = m.id
        AND t.type = ?
    )
  `;

  if (negated) return `NOT ${existsClause}`;
  return existsClause;
}

function buildIdsPredicate(column, ids, params, chunkSize = 900) {
  if (!ids.length) return null;

  const chunks = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    const slice = ids.slice(index, index + chunkSize);
    const placeholders = slice.map(() => "?").join(", ");
    chunks.push(`${column} IN (${placeholders})`);
    params.push(...slice);
  }

  if (chunks.length === 1) return chunks[0];
  return `(${chunks.join(" OR ")})`;
}

// notes:, text:, filename: and similar: match in memory, so getPosts resolves them to ids before the
// SQL is built. An unresolved or empty result means "matches nothing", which negates to
// "matches everything" rather than collapsing the whole query.
function buildResolvedIdsPredicate(node, params) {
  const ids = Array.isArray(node.mediaIds)
    ? node.mediaIds.filter(id => Number.isInteger(id) && id > 0)
    : [];

  const predicate = buildIdsPredicate("m.id", ids, params);
  if (!predicate) return node.negated ? "1 = 1" : "1 = 0";

  return node.negated ? `NOT ${predicate}` : predicate;
}

// Ranked ids are inlined rather than bound: they are validated integers, and a jump table
// keeps ordering O(1) per row. Capped because relevance past a few hundred fuzzy hits is
// noise, and an unbounded CASE would make the statement enormous.
const MAX_RELEVANCE_IDS = 500;

function buildRelevanceOrderSql(relevanceIds) {
  if (!relevanceIds?.length) return null;

  const ranked = relevanceIds
    .filter(id => Number.isInteger(id) && id > 0)
    .slice(0, MAX_RELEVANCE_IDS);
  if (!ranked.length) return null;

  const whenClauses = ranked.map((id, rank) => `WHEN ${id} THEN ${rank}`).join(" ");

  return `CASE m.id ${whenClauses} ELSE ${ranked.length} END`;
}

export const MAX_RANDOM_SEED = 2 ** 31;

// SQLite cannot seed random(), and every "load more" is a fresh query, so the shuffle is a
// hash of id and seed that gives the same order on each page. One LCG step alone would only
// rotate a fixed order as the seed changes; taking the middle bits of its square breaks that.
// Every intermediate value stays under 2^62, clear of SQLite's integer overflow to REAL.
// Seeds within about a thousand of each other give nearly the same order, which random
// seeds over 2^31 make a one-in-a-million event.
function buildRandomOrderSql(seed) {
  const safeSeed = Number.isInteger(seed) && seed >= 0 && seed < MAX_RANDOM_SEED ? seed : 0;
  const mixed = `((m.id * 1103515245 + ${safeSeed}) % 2147483648)`;

  return `((${mixed} * ${mixed}) / 65536) % 2147483648, m.id`;
}

// Limit and offset are trusted: getPostsPage validates them, and parseSearch clamps limit:.
// Clamping again here would cut its limit+1 look-ahead row and hide the next page.
export default function buildQuery(parsed, {
  limit = parsed.filters.limit,
  offset = 0,
  tagOrderSql = TAG_ORDER_SQL,
  relevanceIds = null,
  seed = 0,
} = {}) {
  const { filters, expression } = parsed;
  const params = [];

  // Every column but phash, which runs to kilobytes per video and only similar: reads.
  let sql = `
    SELECT
      m.id, m.file_path, m.created_at, m.file_size, m.mime_type, m.width, m.height,
      m.duration_ms, m.original_filename, m.notes_md, m.variants, m.checksum, m.score,

      (
        SELECT COUNT(*)
        FROM media_tags mt
        WHERE mt.media_id = m.id
      ) AS tag_count,

      COALESCE((
        SELECT json_group_array(
          json_object(
            'id', t.id,
            'name', t.name,
            'type', t.type
          )
        )
        FROM (
          SELECT t.id, t.name, t.type
          FROM media_tags mt
          JOIN tags t ON t.id = mt.tag_id
          WHERE mt.media_id = m.id
          ORDER BY
            ${tagOrderSql},
            t.name COLLATE NOCASE
        ) t
      ), '[]') AS tags

    FROM media m
  `;

  const predicate = buildPredicate(expression, params);
  if (predicate) sql += " WHERE " + predicate;

  // Relevance leads when present; the requested order still breaks ties, and rows past the
  // ranked cap fall back to it entirely.
  const requestedOrderSql = filters.orderKey === "random"
    ? buildRandomOrderSql(seed)
    : filters.orderBy;
  const relevanceOrderSql = buildRelevanceOrderSql(relevanceIds);
  const orderBy = relevanceOrderSql
    ? `${relevanceOrderSql}, ${requestedOrderSql}`
    : requestedOrderSql;

  sql += `
    ORDER BY ${orderBy}
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  return { sql, params };
}
