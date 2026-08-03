import parseComparable from "@/lib/listingQuery/parseComparable";
import parseImageRatio from "@/lib/listingQuery/parseImageRatio";
import tokenizeSearchString from "@/lib/listingQuery/tokenizeSearchString";

function parseTagExpression(tokens = []) {
  let index = 0;

  const peek = () => tokens[index] ?? null;
  const consume = () => tokens[index++] ?? null;
  const isTermStart = token => token?.kind === "term" || token?.kind === "lparen";

  function parsePrimary() {
    const token = peek();
    if (!token) return null;

    // Every predicate - a tag or an operator alike - is a term, so all of them can sit on
    // either side of an OR. Operators used to bypass this tree entirely and get AND-ed in
    // afterwards, which silently turned `fish OR notes:"fish"` into an AND.
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

      if (token?.kind === "and") {
        consume();
        const rhs = parsePrimary();
        if (!rhs) continue;

        node = {
          type: "AND",
          left: node,
          right: rhs,
        };
        continue;
      }

      if (isTermStart(token)) {
        const rhs = parsePrimary();
        if (!rhs) break;

        node = {
          type: "AND",
          left: node,
          right: rhs,
        };
        continue;
      }

      break;
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

      node = {
        type: "OR",
        left: node,
        right: rhs,
      };
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

    expression = expression
      ? {
        type: "AND",
        left: expression,
        right: node,
      }
      : node;
  }

  return expression;
}

export default function parseSearch(searchString = "", options = {}) {
  const tokens = tokenizeSearchString(searchString);

  // Injected by callers that have DB access, so parsing stays pure on its own.
  const resolveTagName = typeof options.resolveTagName === "function"
    ? options.resolveTagName
    : name => name;

  const includeTags = [];
  const excludeTags = [];
  const expressionTokens = [];
  const mentionedTags = new Set();

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
  const ORDER_BY = Object.fromEntries(
    Object.entries(ORDER_BY_BASE).flatMap(([key, expression]) => ([
      [key, `${expression} DESC`],
      [`${key}_asc`, `${expression} ASC`],
    ]))
  );

  const FILE_SIZE_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i;
  const AGE_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)(s|m|h|d|w|y)?$/i;
  const DURATION_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)(ms|s|m|h)?$/i;
  const MPIXELS_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)$/i;
  // Whole numbers only: a score is one of six values, so "score:>3.5" is a typo.
  const SCORE_RE = /^(<=|>=|<|>|=)?(\d+)$/;
  const FILE_SIZE_UNITS = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  const AGE_UNITS = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
    w: 60 * 60 * 24 * 7,
    y: 60 * 60 * 24 * 365,
  };
  const DURATION_UNITS = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
  };

  const filters = {
    orderBy: ORDER_BY.date,
    limit: 100,
    // Only settings live here now. Every predicate is a term in `expression`, so that all
    // of them can participate in AND/OR/negation rather than being AND-ed in afterwards.
    // Base name of an explicit `order:` token, direction stripped. Stays null for the
    // default ordering, so a default listing is distinguishable from `order:date`.
    orderKey: null,
  };

  function toNotesSearchTerm(rawValue) {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;
    return trimmed.replace(/(^"|"$)/, "");
  }

  function addTerm(node) {
    expressionTokens.push({ kind: "term", node });
  }

  function addTagToken(rawValue, { negated = false } = {}) {
    const value = resolveTagName(String(rawValue ?? "").trim());
    if (!value) return;

    if (negated) excludeTags.push(value);
    else includeTags.push(value);

    mentionedTags.add(value);
    addTerm({ type: "TERM", kind: "tag", name: value, negated });
  }

  // Comparable operators all share this shape, differing only in how the value parses.
  function addComparableToken(kind, rawValue, parse, negated) {
    const comparison = parse(rawValue);
    if (!comparison) return;

    addTerm({ type: "TERM", kind, comparison, negated });
  }

  function addFuzzyToken(kind, rawValue, negated) {
    const query = toNotesSearchTerm(rawValue);
    if (!query) return;

    // `mediaIds` is filled in by getPosts, which resolves the query against the in-memory
    // indexes before the SQL is built.
    addTerm({ type: "TERM", kind, query, mediaIds: null, negated });
  }

  for (const rawToken of tokens) {
    if (rawToken === "OR") {
      expressionTokens.push({ kind: "or" });
      continue;
    }

    if (rawToken === "AND") {
      expressionTokens.push({ kind: "and" });
      continue;
    }

    if (rawToken === "(") {
      expressionTokens.push({ kind: "lparen" });
      continue;
    }

    if (rawToken === ")") {
      expressionTokens.push({ kind: "rparen" });
      continue;
    }

    // Stripped once here rather than per operator, so every predicate can be negated -
    // previously only `-has:` was, and `-score:5` fell through to a nonsense tag search.
    const negated = rawToken.startsWith("-");
    const token = negated ? rawToken.slice(1) : rawToken;

    if (token.startsWith("limit:")) {
      const parsedLimit = Number(token.slice(6));
      if (Number.isFinite(parsedLimit) && parsedLimit > 0)
        filters.limit = Math.min(Math.floor(parsedLimit), 500);
      else
        filters.limit = 100;
      continue;
    }

    if (token.startsWith("order:")) {
      const orderKey = token.slice(6);
      if (ORDER_BY[orderKey]) {
        filters.orderBy = ORDER_BY[orderKey];
        filters.orderKey = orderKey.replace(/_asc$/, "");
      }
      continue;
    }

    if (token.startsWith("mime_type:")) {
      const mimeType = token.slice("mime_type:".length).trim().toLowerCase();
      // Each occurrence is its own term, so repeating it now means AND and matches
      // nothing. Previously they collected into an IN list, an implicit OR.
      if (mimeType) addTerm({ type: "TERM", kind: "mime_type", value: mimeType, negated });
      continue;
    }

    if (token.startsWith("file_size:")) {
      addComparableToken(
        "file_size",
        token.slice("file_size:".length),
        value => parseComparable(value, FILE_SIZE_RE, FILE_SIZE_UNITS, "b"),
        negated
      );
      continue;
    }

    if (token.startsWith("age:")) {
      addComparableToken(
        "age",
        token.slice("age:".length),
        value => parseComparable(value, AGE_RE, AGE_UNITS, "d"),
        negated
      );
      continue;
    }

    if (token.startsWith("mpixels:")) {
      addComparableToken(
        "mpixels",
        token.slice("mpixels:".length),
        value => parseComparable(value, MPIXELS_RE, { value: 1_000_000 }, "value", { integer: false }),
        negated
      );
      continue;
    }

    if (token.startsWith("score:")) {
      addComparableToken(
        "score",
        token.slice("score:".length),
        value => parseComparable(value, SCORE_RE, { value: 1 }, "value"),
        negated
      );
      continue;
    }

    if (token.startsWith("duration:")) {
      addComparableToken(
        "duration",
        token.slice("duration:".length),
        value => parseComparable(value, DURATION_RE, DURATION_UNITS, "ms"),
        negated
      );
      continue;
    }

    if (token.startsWith("image_ratio:")) {
      addComparableToken(
        "image_ratio",
        token.slice("image_ratio:".length),
        value => parseImageRatio(value),
        negated
      );
      continue;
    }

    if (token.startsWith("notes:")) {
      addFuzzyToken("notes", token.slice("notes:".length), negated);
      continue;
    }

    if (token.startsWith("text:")) {
      addFuzzyToken("text", token.slice("text:".length), negated);
      continue;
    }

    if (token.startsWith("filename:")) {
      addFuzzyToken("filename", token.slice("filename:".length), negated);
      continue;
    }

    if (token.startsWith("has:")) {
      const value = token.slice("has:".length).trim().toLowerCase();
      if (value) addTerm({ type: "TERM", kind: "has", value, negated });
      continue;
    }

    addTagToken(token, { negated });
  }

  let expression = parseTagExpression(expressionTokens);

  if (Array.isArray(options.defaultExcludedTags) && options.defaultExcludedTags.length) {
    for (const tag of options.defaultExcludedTags) {
      const name = resolveTagName(String(tag ?? "").trim());
      if (!name) continue;
      if (mentionedTags.has(name)) continue;

      excludeTags.push(name);
      mentionedTags.add(name);

      const defaultNode = {
        type: "TERM",
        kind: "tag",
        name,
        negated: true,
      };

      // AND-ed at the top level, so a blacklist entry narrows the whole query rather than
      // binding to whichever branch happens to be last.
      expression = expression
        ? {
          type: "AND",
          left: expression,
          right: defaultNode,
        }
        : defaultNode;
    }
  }

  return {
    includeTags,
    excludeTags,
    filters,
    expression,
  };
}
