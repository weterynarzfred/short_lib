import parseComparable from "@/lib/listingQuery/parseComparable";
import parseImageRatio from "@/lib/listingQuery/parseImageRatio";
import tokenizeSearchString from "@/lib/listingQuery/tokenizeSearchString";

function parseTagExpression(tokens = []) {
  let index = 0;

  const peek = () => tokens[index] ?? null;
  const consume = () => tokens[index++] ?? null;
  const isTermStart = token => token?.kind === "tag" || token?.kind === "lparen";

  function parsePrimary() {
    const token = peek();
    if (!token) return null;

    if (token.kind === "tag") {
      consume();
      return {
        type: "TAG",
        name: token.value,
        negated: token.negated,
      };
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
    mimeTypes: [],
    fileSize: null,
    age: null,
    mpixels: null,
    score: null,
    duration: null,
    imageRatio: null,
    notes: null,
    text: null,
    filename: null,
    has: [],
    // Base name of an explicit `order:` token, direction stripped. Stays null for the
    // default ordering, so a default listing is distinguishable from `order:date`.
    orderKey: null,
  };

  function toNotesSearchTerm(rawValue) {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;
    return trimmed.replace(/(^"|"$)/, "");
  }

  function addTagToken(rawValue, { negated = false } = {}) {
    const value = resolveTagName(String(rawValue ?? "").trim());
    if (!value) return;

    if (negated) excludeTags.push(value);
    else includeTags.push(value);

    mentionedTags.add(value);
    expressionTokens.push({
      kind: "tag",
      value,
      negated,
    });
  }

  function addHasToken(rawValue, { negated = false } = {}) {
    const value = String(rawValue ?? "").trim().toLowerCase();
    if (!value) return;

    filters.has.push({
      value,
      negated,
    });
  }

  for (const token of tokens) {
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
      if (mimeType) filters.mimeTypes.push(mimeType);
      continue;
    }

    if (token.startsWith("file_size:")) {
      const parsed = parseComparable(
        token.slice("file_size:".length),
        FILE_SIZE_RE,
        FILE_SIZE_UNITS,
        "b"
      );
      if (parsed) filters.fileSize = parsed;
      continue;
    }

    if (token.startsWith("age:")) {
      const parsed = parseComparable(
        token.slice("age:".length),
        AGE_RE,
        AGE_UNITS,
        "d"
      );
      if (parsed) filters.age = parsed;
      continue;
    }

    if (token.startsWith("mpixels:")) {
      const parsed = parseComparable(
        token.slice("mpixels:".length),
        MPIXELS_RE,
        { value: 1_000_000 },
        "value",
        { integer: false }
      );
      if (parsed) filters.mpixels = parsed;
      continue;
    }

    if (token.startsWith("score:")) {
      const parsed = parseComparable(
        token.slice("score:".length),
        SCORE_RE,
        { value: 1 },
        "value"
      );
      if (parsed) filters.score = parsed;
      continue;
    }

    if (token.startsWith("duration:")) {
      const parsed = parseComparable(
        token.slice("duration:".length),
        DURATION_RE,
        DURATION_UNITS,
        "ms"
      );
      if (parsed) filters.duration = parsed;
      continue;
    }

    if (token.startsWith("image_ratio:")) {
      const parsed = parseImageRatio(token.slice("image_ratio:".length));
      if (parsed) filters.imageRatio = parsed;
      continue;
    }

    if (token.startsWith("notes:")) {
      const term = toNotesSearchTerm(token.slice("notes:".length));
      if (term) filters.notes = filters.notes ? `${filters.notes} ${term}` : term;
      continue;
    }

    if (token.startsWith("text:")) {
      const term = toNotesSearchTerm(token.slice("text:".length));
      if (term) filters.text = filters.text ? `${filters.text} ${term}` : term;
      continue;
    }

    if (token.startsWith("filename:")) {
      const term = toNotesSearchTerm(token.slice("filename:".length));
      if (term) filters.filename = filters.filename ? `${filters.filename} ${term}` : term;
      continue;
    }

    if (token.startsWith("-has:")) {
      addHasToken(token.slice("-has:".length), { negated: true });
      continue;
    }

    if (token.startsWith("has:")) {
      addHasToken(token.slice("has:".length));
      continue;
    }

    if (token === "OR") {
      expressionTokens.push({ kind: "or" });
      continue;
    }

    if (token === "AND") {
      expressionTokens.push({ kind: "and" });
      continue;
    }

    if (token === "(") {
      expressionTokens.push({ kind: "lparen" });
      continue;
    }

    if (token === ")") {
      expressionTokens.push({ kind: "rparen" });
      continue;
    }

    if (token.startsWith("-")) {
      addTagToken(token.slice(1), { negated: true });
      continue;
    }

    addTagToken(token);
  }

  let tagExpression = parseTagExpression(expressionTokens);

  if (Array.isArray(options.defaultExcludedTags) && options.defaultExcludedTags.length) {
    for (const tag of options.defaultExcludedTags) {
      const name = resolveTagName(String(tag ?? "").trim());
      if (!name) continue;
      if (mentionedTags.has(name)) continue;

      excludeTags.push(name);
      mentionedTags.add(name);

      const defaultNode = {
        type: "TAG",
        name,
        negated: true,
      };

      tagExpression = tagExpression
        ? {
          type: "AND",
          left: tagExpression,
          right: defaultNode,
        }
        : defaultNode;
    }
  }

  return {
    includeTags,
    excludeTags,
    filters,
    tagExpression,
  };
}
