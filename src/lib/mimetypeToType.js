export default function mimetypeToType(mimetype) {
  if (typeof mimetype !== "string") return "other";

  const normalized = mimetype.trim().toLowerCase();
  if (!normalized) return "other";

  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("text/")) return "text";
  return "other";
}
