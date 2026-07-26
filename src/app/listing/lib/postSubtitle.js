import formatBytes from "@/lib/formatBytes";
import formatDate from "@/lib/formatDate";
import formatDuration from "@/lib/formatDuration";
import formatMegapixels from "@/lib/formatMegapixels";

// `formatBytes` reports 0 for a missing size, which would read as a real measurement.
function formatFileSize(fileSize) {
  const bytes = Number(fileSize);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";

  return formatBytes(bytes);
}

// Every other kind carries its own unit, so this one needs a word to stay unambiguous
// when several lines are stacked. Unlike a size or duration, zero here is a real
// measurement - a post genuinely without tags - so absence is checked before coercion,
// which would otherwise turn null into 0.
function formatTagCount(tagCount) {
  if (tagCount === null || tagCount === undefined) return "";

  const count = Number(tagCount);
  if (!Number.isFinite(count) || count < 0) return "";

  return count === 1 ? "1 tag" : `${count} tags`;
}

function formatKind(post, kind) {
  switch (kind) {
    case "file_size":
      return formatFileSize(post.file_size);
    case "duration":
      return formatDuration(post.duration_ms);
    case "mpixels":
      return formatMegapixels(post.width, post.height);
    case "age":
      return formatDate(post.created_at);
    case "tag_count":
      return formatTagCount(post.tag_count);
    default:
      return "";
  }
}

// One entry per line to render. Kinds whose value is missing on this post are dropped
// rather than shown as a zero.
export default function getPostSubtitles(post, subtitleKinds) {
  if (!post || !Array.isArray(subtitleKinds)) return [];

  return subtitleKinds
    .map(kind => ({ kind, text: formatKind(post, kind) }))
    .filter(entry => entry.text);
}
