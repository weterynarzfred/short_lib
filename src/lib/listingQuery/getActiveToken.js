const ESCAPABLE = new Set(["\"", "\\", "(", ")"]);

// Reports the token the caret sits in, using the same quote and escape rules as
// tokenizeSearchString, so the search editor and the parser agree on where a token starts
// and ends. `inQuotes` lets callers tell that the caret is inside a quoted phrase such as
// notes:"still typing, where whitespace does not begin a new token and tag suggestions
// would be nonsense.
export default function getActiveToken(value = "", cursor) {
  const text = String(value ?? "");
  const pos = typeof cursor === "number"
    ? Math.max(0, Math.min(cursor, text.length))
    : text.length;

  let inQuotes = false;
  let tokenStart = 0;

  let cursorInQuotes = false;
  let cursorTokenStart = 0;
  let reachedCursor = false;
  let end = text.length;

  for (let index = 0; index <= text.length; index++) {
    if (!reachedCursor && index >= pos) {
      cursorInQuotes = inQuotes;
      cursorTokenStart = tokenStart;
      reachedCursor = true;
    }

    if (index === text.length) break;

    const char = text[index];

    if (char === "\\" && ESCAPABLE.has(text[index + 1])) {
      index++;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && /\s/.test(char)) {
      // Past the caret this is the token's closing boundary; before it, the start of the
      // next candidate token.
      if (reachedCursor) {
        end = index;
        break;
      }

      tokenStart = index + 1;
    }
  }

  const beforeCursor = text.slice(cursorTokenStart, pos);

  return {
    start: cursorTokenStart,
    end,
    token: text.slice(cursorTokenStart, end),
    query: beforeCursor.replace(/^-/, ""),
    inQuotes: cursorInQuotes,
  };
}
