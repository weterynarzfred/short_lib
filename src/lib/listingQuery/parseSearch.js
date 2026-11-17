import parseComparable from "@/lib/listingQuery/parseComparable";
import parseImageRatio from "@/lib/listingQuery/parseImageRatio";
import tokenizeSearchString from "@/lib/listingQuery/tokenizeSearchString";

const ORDER_BY_BASE = {
  date: "m.created_at",
  duration: "m.duration_ms",
  file_size: "m.file_size",
  pixelcount: "(COALESCE(m.width, 0) * COALESCE(m.height, 0))",
  image_ratio: `
    CASE
      WHEN m.width IS NOT NULL AND m.height IS NOT NULL AND m.height > 0
        THEN CAST(m.width AS REAL) / m.height
      ELSE NULL
    END
  `,
  tag_count: "tag_count",
  score: "m.score",
};

// Every order gets an `_asc` twin, so `order:date` and `order:date_asc` both exist without
// listing each one twice.
const ORDER_BY = Object.fromEntries(
  Object.entries(ORDER_BY_BASE).flatMap(([key, expression]) => ([
    [key, `${expression} DESC`],
    [`${key}_asc`, `${expression} ASC`],
  ]))
);

// `random` has no SQL here and no `_asc` twin: its order depends on a seed only the query
// builder is given.
export const ORDER_KEYS = [...Object.keys(ORDER_BY), "random"];

const FILE_SIZE_UNITS = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
const AGE_UNITS = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
  w: 60 * 60 * 24 * 7,
  y: 60 * 60 * 24 * 365,
};
const DURATION_UNITS = { ms: 1, s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 };

const FILE_SIZE_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i;
const AGE_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)(s|m|h|d|w|y)?$/i;
const DURATION_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)(ms|s|m|h)?$/i;
const MPIXELS_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)$/i;
// Whole numbers only: a score is one of six values, so "score:>3.5" is a typo.
const SCORE_RE = /^(<=|>=|<|>|=)?(\d+)$/;

// The operators that compare a number against a column. Each one only has to say how its
// value parses; everything else about them is identical.
const COMPARABLE_OPERATORS = {
  file_size: value => parseComparable(value, FILE_SIZE_RE, FILE_SIZE_UNITS, "b"),
  age: value => parseComparable(value, AGE_RE, AGE_UNITS, "d"),
  duration: value => parseComparable(value, DURATION_RE, DURATION_UNITS, "ms"),
  mpixels: value =>
    parseComparable(value, MPIXELS_RE, { value: 1_000_000 }, "value", { integer: false }),
  score: value => parseComparable(value, SCORE_RE, { value: 1 }, "value"),
  image_ratio: value => parseImageRatio(value),
};

// The operators matched in memory rather than in SQL. `getPosts` resolves each one against
// a Fuse index and writes `mediaIds` onto its term before the query is built.
const FUZZY_OPERATORS = new Set(["notes", "text", "filename"]);

const EXPRESSION_TOKENS = {
  OR: "or",
  AND: "and",
  "(": "lparen",
  ")": "rparen",
};

function splitOperator(token) {
  const colon = token.indexOf(":");
  if (colon <= 0) return null;

  return { name: token.slice(0, colon), value: token.slice(colon + 1) };
}

// Quotes are how a value with spaces survives tokenizing, so they are not part of the term.
function unquote(rawValue) {
  return rawValue.trim().replace(/(^"|"$)/, "");
}

function parseTagExpression(tokens) {
  let index = 0;

  const peek = () => tokens[index] ?? null;
  const consume = () => tokens[index++] ?? null;
  const isTermStart = token => token?.kind === "term" || token?.kind === "lparen";

  function parsePrimary() {
    const token = peek();
    if (!token) return null;

    // Every predicate - a tag or an operator alike - is a term, so all of them can sit on
    // either side of an OR.
    if (token.kind === "term") {
      consume();
      return token.node;
    }

    if (token.kind === "lparen") {
      consume();
      const inner = parseOr();
      if (peek()?.kind === "rparen") consume();
      return inner;
    }

    return null;
  }

  function parseAnd() {
    let node = parsePrimary();
    if (!node) return null;

    while (true) {
      const token = peek();
      // Two terms side by side mean AND, so an explicit `AND` and a plain space are the
      // same thing here.
      const isImplicitAnd = isTermStart(token);
      if (token?.kind !== "and" && !isImplicitAnd) break;

      if (token?.kind === "and") consume();

      const rhs = parsePrimary();
      if (!rhs) {
        if (isImplicitAnd) break;
        continue;
      }

      node = { type: "AND", left: node, right: rhs };
    }

    return node;
  }

  function parseOr() {
    let node = parseAnd();
    if (!node) return null;

    while (peek()?.kind === "or") {
      consume();
      const rhs = parseAnd();
      if (!rhs) continue;

      node = { type: "OR", left: node, right: rhs };
    }

    return node;
  }

  let expression = null;

  while (index < tokens.length) {
    if (peek()?.kind === "rparen") {
      consume();
      continue;
    }

    const node = parseOr();
    if (!node) {
      consume();
      continue;
    }

    expression = expression ? { type: "AND", left: expression, right: node } : node;
  }

  return expression;
}

// Operators that take a post id. similar: is resolved in memory like the fuzzy ones;
// parent: is plain SQL.
const POST_ID_OPERATORS = new Set(["similar", "parent"]);

const TERM_OPERATORS = new Set([
  "mime_type",
  "has",
  ...Object.keys(COMPARABLE_OPERATORS),
  ...FUZZY_OPERATORS,
  ...POST_ID_OPERATORS,
]);

// A set opened with parent: reads in order, parent first. Grouping by the parent keeps
// `parent:1 OR parent:2` as two runs rather than interleaving them.
const FAMILY_ORDER_BY = "COALESCE(m.parent_id, m.id), m.parent_id IS NOT NULL, m.child_position, m.id";

export function isTermOperator(token) {
  return TERM_OPERATORS.has(splitOperator(token)?.name);
}

function applySetting(token, filters) {
  const operator = splitOperator(token.replace(/^-/, ""));
  if (!operator) return false;

  const { name, value } = operator;

  if (name === "limit") {
    const parsedLimit = Number(value);
    filters.limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.floor(parsedLimit), 500)
      : 100;
    return true;
  }

  if (name === "order") {
    if (value === "random") {
      filters.orderBy = null;
      filters.orderKey = "random";
    } else if (ORDER_BY[value]) {
      filters.orderBy = ORDER_BY[value];
      filters.orderKey = value.replace(/_asc$/, "");
    }
    return true;
  }

  return false;
}

// Returns the term node and a key naming what it asks about regardless of negation, which
// is how a blacklist entry tells that the query already mentions it.
function parseTerm(rawToken, resolveTagName) {
  const negated = rawToken.startsWith("-");
  const token = negated ? rawToken.slice(1) : rawToken;
  const { name, value } = splitOperator(token) ?? {};
  const key = `${name}:${value?.trim().toLowerCase()}`;

  if (name === "mime_type" || name === "has") {
    // Each occurrence is its own term, so repeating one means AND and matches nothing.
    const normalized = value.trim().toLowerCase();
    return normalized ? { key, node: { type: "TERM", kind: name, value: normalized, negated } } : null;
  }

  if (COMPARABLE_OPERATORS[name]) {
    const comparison = COMPARABLE_OPERATORS[name](value);
    return comparison ? { key, node: { type: "TERM", kind: name, comparison, negated } } : null;
  }

  if (POST_ID_OPERATORS.has(name)) {
    const postId = Number(value);
    if (!Number.isInteger(postId) || postId <= 0) return null;

    return { key, node: { type: "TERM", kind: name, query: postId, negated } };
  }

  if (FUZZY_OPERATORS.has(name)) {
    const query = unquote(value);
    return query ? { key, node: { type: "TERM", kind: name, query, mediaIds: null, negated } } : null;
  }

  // A plain tag, or not an operator after all - `series:one` is a typed tag.
  const tagName = resolveTagName(token.trim());
  return tagName ? { key: `tag:${tagName}`, node: { type: "TERM", kind: "tag", name: tagName, negated } } : null;
}

export default function parseSearch(searchString = "", options = {}) {
  const tokens = tokenizeSearchString(searchString);

  // Injected by callers that have DB access, so parsing stays pure on its own.
  const resolveTagName = options.resolveTagName ?? (name => name);

  const includeTags = [];
  const excludeTags = [];
  const expressionTokens = [];
  const mentionedKeys = new Set();
  let asksForSpecificPosts = false;
  let asksForFamily = false;

  const filters = {
    orderBy: ORDER_BY.date,
    limit: 100,
    // Only settings live here; every predicate is a term in `expression`.
    // `orderKey` is the base name of an explicit `order:` token, direction stripped, and
    // stays null for the default so a plain listing is distinguishable from `order:date`.
    orderKey: null,
  };

  for (const rawToken of tokens) {
    const expressionKind = EXPRESSION_TOKENS[rawToken];
    if (expressionKind) {
      expressionTokens.push({ kind: expressionKind });
      continue;
    }

    if (applySetting(rawToken, filters)) continue;

    const term = parseTerm(rawToken, resolveTagName);
    if (!term) continue;

    const { node } = term;
    mentionedKeys.add(term.key);
    expressionTokens.push({ kind: "term", node });

    if (node.kind === "tag") (node.negated ? excludeTags : includeTags).push(node.name);
    if (POST_ID_OPERATORS.has(node.kind) && !node.negated) asksForSpecificPosts = true;
    if (node.kind === "parent" && !node.negated) asksForFamily = true;
  }

  if (asksForFamily && !filters.orderKey) filters.orderBy = FAMILY_ORDER_BY;

  let expression = parseTagExpression(expressionTokens);

  // similar: and parent: ask about particular posts, usually the one open in the panel, so
  // hiding them behind the blacklist would answer with an empty page.
  const blacklist = asksForSpecificPosts ? [] : options.blacklist ?? [];

  for (const entry of blacklist) {
    const term = parseTerm(entry, resolveTagName);
    if (!term || mentionedKeys.has(term.key)) continue;

    const { node } = term;
    node.negated = true;
    mentionedKeys.add(term.key);
    if (node.kind === "tag") excludeTags.push(node.name);

    // AND-ed at the top level, so a blacklist entry narrows the whole query rather than
    // binding to whichever branch happens to be last.
    expression = expression ? { type: "AND", left: expression, right: node } : node;
  }

  return {
    includeTags,
    excludeTags,
    filters,
    expression,
  };
}
