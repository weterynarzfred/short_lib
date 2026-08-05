import formatDate from "@/lib/formatDate";

import { formatFileSize, formatScore } from "./postSubtitle";

// Notes hold OCR output, which runs to thousands of characters. The tooltip is a glance,
// not a reader - the panel is where the whole thing lives.
export const NOTES_CLIP_CHARS = 400;

export function clipNotes(notes) {
  const text = String(notes ?? "").trim();
  if (!text) return "";
  if (text.length <= NOTES_CLIP_CHARS) return text;

  // Cut on a word boundary when there is one close to the limit, so the clip does not end
  // mid-word. A long unbroken run - a URL, a hash - has none, and is cut where it falls.
  const head = text.slice(0, NOTES_CLIP_CHARS);
  const lastSpace = head.lastIndexOf(" ");
  const body = lastSpace > NOTES_CLIP_CHARS - 40 ? head.slice(0, lastSpace) : head;

  return `${body.trimEnd()}…`;
}

// Everything the row carries that the card does not already show. The badge holds duration,
// megapixels and the extension, so those are left out; the subtitle lines are configurable,
// so whichever kinds are switched on are left out too.
export function getMetaParts(post, subtitleKinds = []) {
  const shown = new Set(Array.isArray(subtitleKinds) ? subtitleKinds : []);
  const parts = [];

  const score = shown.has("score") ? "" : formatScore(post?.score);
  if (score) parts.push(score);

  const date = shown.has("age") ? "" : formatDate(post?.created_at);
  if (date) parts.push(date);

  const size = shown.has("file_size") ? "" : formatFileSize(post?.file_size);
  if (size) parts.push(size);

  // The badge shows megapixels, which is the wrong number for "will this fit on my screen".
  if (post?.width > 0 && post?.height > 0) parts.push(`${post.width}×${post.height}`);

  // More specific than the extension on the badge: mkv, webm and mp4 all read as video/*,
  // but which container it is decides what will actually play.
  if (post?.mime_type) parts.push(post.mime_type);

  return parts;
}
