// Which metadata values the listing shows under each post, one per line.
//
// A kind is included when a filter narrowed on it or an explicit `order:` sorted by it -
// either way the user has said they care about that number. Walking one canonical list
// gives a stable line order and de-duplicates `file_size:>1mb order:file_size` for free.
//
// `image_ratio` is deliberately absent: a bare decimal reads as noise.
const SUBTITLE_KINDS = [
  { kind: "file_size", filterKey: "fileSize", orderKey: "file_size" },
  { kind: "duration", filterKey: "duration", orderKey: "duration" },
  { kind: "mpixels", filterKey: "mpixels", orderKey: "pixelcount" },
  { kind: "age", filterKey: "age", orderKey: "date" },
  { kind: "tag_count", filterKey: null, orderKey: "tag_count" },
];

export default function getSubtitleKinds(filters) {
  if (!filters) return [];

  return SUBTITLE_KINDS
    .filter(({ filterKey, orderKey }) =>
      (filterKey && filters[filterKey]) || (orderKey && filters.orderKey === orderKey))
    .map(({ kind }) => kind);
}
