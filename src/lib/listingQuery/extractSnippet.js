export const SNIPPET_WINDOW = 64;

function toValidRanges(ranges, length) {
  return (Array.isArray(ranges) ? ranges : [])
    .filter(range => range
      && Number.isInteger(range.start) && Number.isInteger(range.end)
      && range.start >= 0 && range.end >= range.start && range.start < length)
    .map(range => ({ start: range.start, end: Math.min(range.end, length - 1) }));
}

// Overlapping or touching ranges become one, so two terms matching adjacent characters do
// not produce two marks with nothing between them.
function mergeRanges(ranges) {
  const merged = [];

  for (const range of [...ranges].sort((left, right) => left.start - right.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end + 1) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }

  return merged;
}

// Pulls the matched fragment out of a long note with a fixed window of context either
// side, so an OCR dump shows why it matched instead of just its opening words.
//
// `ranges` is best-scoring first: the window centres on `ranges[0]`, and every range
// falling inside that window is marked, so a multi-term search highlights each term it
// found. Terms landing outside the window are not shown - the window is deliberately
// fixed rather than stretching to reach them.
//
// Returns segments rather than a marked-up string, leaving the rendering to the caller.
export default function extractSnippet(text, ranges, { window = SNIPPET_WINDOW } = {}) {
  const source = String(text ?? "");
  if (!source) return null;

  const valid = toValidRanges(ranges, source.length);

  // Without a usable range, fall back to the opening of the note.
  if (!valid.length) {
    const head = source.slice(0, window * 2);

    return {
      segments: head ? [{ text: head, isMatch: false }] : [],
      truncatedStart: false,
      truncatedEnd: head.length < source.length,
    };
  }

  const [primary] = valid;
  const from = Math.max(0, primary.start - window);
  const to = Math.min(source.length, primary.end + 1 + window);

  const visible = mergeRanges(
    valid
      .map(range => ({
        start: Math.max(range.start, from),
        end: Math.min(range.end, to - 1),
      }))
      .filter(range => range.start <= range.end)
  );

  const segments = [];
  let cursor = from;

  for (const range of visible) {
    if (range.start > cursor)
      segments.push({ text: source.slice(cursor, range.start), isMatch: false });

    segments.push({ text: source.slice(range.start, range.end + 1), isMatch: true });
    cursor = range.end + 1;
  }

  if (cursor < to) segments.push({ text: source.slice(cursor, to), isMatch: false });

  return {
    segments,
    truncatedStart: from > 0,
    truncatedEnd: to < source.length,
  };
}
