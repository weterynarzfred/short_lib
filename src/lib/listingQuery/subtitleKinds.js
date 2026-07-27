// Which metadata values the listing shows under each post, one per line.
//
// A kind is included when a filter narrowed on it or an explicit `order:` sorted by it -
// either way the user has said they care about that number. Walking one canonical list
// gives a stable line order and de-duplicates `file_size:>1mb order:file_size` for free.
//
// `image_ratio` is deliberately absent: a bare decimal reads as noise.
const SUBTITLE_KINDS = [
  // `hasKey` covers `has:score`, which narrows on the score without being a score filter.
  // Only when positive: `-has:score` selects unrated posts, which have nothing to show.
  { kind: "score", filterKey: "score", orderKey: "score", hasKey: "score" },
  { kind: "file_size", filterKey: "fileSize", orderKey: "file_size" },
  // No duration or mpixels: the badge on every card already shows both, so repeating them
  // below the thumbnail is noise.
  { kind: "age", filterKey: "age", orderKey: "date" },
  { kind: "tag_count", filterKey: null, orderKey: "tag_count" },
];

function hasPositiveHasFilter(filters, hasKey) {
  if (!hasKey || !Array.isArray(filters.has)) return false;

  return filters.has.some(entry => entry?.value === hasKey && !entry.negated);
}

export default function getSubtitleKinds(filters) {
  if (!filters) return [];

  return SUBTITLE_KINDS
    .filter(({ filterKey, orderKey, hasKey }) =>
      (filterKey && filters[filterKey])
      || (orderKey && filters.orderKey === orderKey)
      || hasPositiveHasFilter(filters, hasKey))
    .map(({ kind }) => kind);
}
