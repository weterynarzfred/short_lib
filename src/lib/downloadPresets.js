import mimetypeToType from "@/lib/mimetypeToType";

// `original` is always available; the rest are offered per media type.
export const DOWNLOAD_PRESETS = {
  original: {
    key: "original",
    label: "original",
    appliesTo: null,
  },
  jpeg: {
    key: "jpeg",
    label: "jpeg (q80)",
    appliesTo: "image",
    extension: "jpg",
    contentType: "image/jpeg",
  },
  mp3: {
    key: "mp3",
    label: "mp3 (320 kbps)",
    appliesTo: "audio",
    extension: "mp3",
    contentType: "audio/mpeg",
  },
  av1: {
    key: "av1",
    label: "av1 mp4 (crf 32)",
    appliesTo: "video",
    extension: "mp4",
    contentType: "video/mp4",
  },
};

export function getPresetsForMimeType(mimeType) {
  const mediaType = mimetypeToType(mimeType);

  return Object.values(DOWNLOAD_PRESETS)
    .filter(preset => preset.appliesTo === null || preset.appliesTo === mediaType);
}

export function isPresetAllowed(presetKey, mimeType) {
  return getPresetsForMimeType(mimeType).some(preset => preset.key === presetKey);
}

// Trimming needs a timeline, so it only means anything for media with a duration.
export function supportsTrim(mimeType) {
  const mediaType = mimetypeToType(mimeType);
  return mediaType === "video" || mediaType === "audio";
}

const TIMESTAMP_RE = /^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/;

// Accepts `SS`, `MM:SS` and `HH:MM:SS`, each optionally with decimals. Returns seconds, or
// null when the input is unusable - callers treat null as "no bound given".
export function parseTimestamp(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const match = TIMESTAMP_RE.exec(raw);
  if (!match) return null;

  const [, first, second, last] = match;
  const parts = [first, second, last].filter(part => part !== undefined);

  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + Number(part);

  if (!Number.isFinite(seconds) || seconds < 0) return null;

  return seconds;
}

// Returns `{ start, duration }` in seconds, or null when no usable trim was asked for.
// An end at or before the start is rejected rather than silently producing an empty file.
export function resolveTrim(startValue, endValue) {
  const start = parseTimestamp(startValue);
  const end = parseTimestamp(endValue);

  if (start === null && end === null) return null;

  const safeStart = start ?? 0;
  if (end === null) return { start: safeStart, duration: null };
  if (end <= safeStart) return null;

  return { start: safeStart, duration: end - safeStart };
}

export function buildDownloadFilename(originalFilename, preset, { trimmed = false } = {}) {
  const base = String(originalFilename ?? "").trim().replace(/\.[^.]+$/, "") || "download";
  const suffix = trimmed ? "-clip" : "";

  if (!preset.extension) {
    const originalExtension = String(originalFilename ?? "").match(/\.[^.]+$/)?.[0] ?? "";
    return `${base}${suffix}${originalExtension}`;
  }

  return `${base}${suffix}.${preset.extension}`;
}
