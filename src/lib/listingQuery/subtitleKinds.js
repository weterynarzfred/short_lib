// Which metadata values the listing shows under each post, one per line.
//
// A kind is included when a term narrowed on it or an explicit `order:` sorted by it -
// either way the user has said they care about that number. Walking one canonical list
// gives a stable line order and de-duplicates `file_size:>1mb order:file_size` for free.
//
// No duration or mpixels: the badge on every card already shows both. No `image_ratio`
// either - a bare decimal reads as noise.
const SUBTITLE_KINDS = [
  // `hasKey` covers `has:score`, which narrows on the score without being a score term.
  { kind: "score", termKind: "score", orderKey: "score", hasKey: "score" },
  { kind: "file_size", termKind: "file_size", orderKey: "file_size" },
  { kind: "age", termKind: "age", orderKey: "date" },
  { kind: "tag_count", termKind: null, orderKey: "tag_count" },
];

// Negated terms are excluded: `-score:5` says which posts to leave out, not that scores
// are worth showing. `-has:score` selects unrated posts, which have no stars to show.
function hasPositiveTerm(node, predicate) {
  if (!node) return false;

  if (node.type === "TERM")
    return !node.negated && predicate(node);

  return hasPositiveTerm(node.left, predicate)
    || hasPositiveTerm(node.right, predicate);
}

export default function getSubtitleKinds(parsed) {
  if (!parsed?.filters) return [];

  const { filters, expression } = parsed;

  return SUBTITLE_KINDS
    .filter(({ termKind, orderKey, hasKey }) =>
      (termKind && hasPositiveTerm(expression, node => node.kind === termKind))
      || (orderKey && filters.orderKey === orderKey)
      || (hasKey && hasPositiveTerm(
        expression,
        node => node.kind === "has" && node.value === hasKey
      )))
    .map(({ kind }) => kind);
}
