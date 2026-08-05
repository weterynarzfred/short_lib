import formatDuration from "@/lib/formatDuration";
import formatMegapixels from "@/lib/formatMegapixels";
import mimetypeToType from "@/lib/mimetypeToType";

export function getFileExtension(post) {
  const source = String(post?.file_path || "").trim();
  const lastDot = source.lastIndexOf(".");
  if (lastDot < 0 || lastDot === source.length - 1) return "file";

  return source.slice(lastDot + 1).toLowerCase();
}

// Extension stays last so the variable-width parts grow leftward from a stable anchor.
// Anything unavailable is dropped rather than rendered as a placeholder.
function getPostBadgeParts(post) {
  const mediaType = mimetypeToType(post?.mime_type);
  const parts = [];

  if (mediaType === "video" || mediaType === "audio")
    parts.push(formatDuration(post?.duration_ms));

  if (mediaType === "video" || mediaType === "image")
    parts.push(formatMegapixels(post?.width, post?.height));

  parts.push(getFileExtension(post).toUpperCase());

  return parts.filter(Boolean);
}

export default function getPostBadgeLabel(post) {
  return getPostBadgeParts(post).join(" · ");
}
