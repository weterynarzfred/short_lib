import mimetypeToType from "@/lib/mimetypeToType";

// AV1's full range. Deliberately unrestricted rather than clipped to the useful band -
// the UI explains what the extremes cost instead of refusing them.
export const CRF_MIN = 0;
export const CRF_MAX = 63;
export const DEFAULT_CRF = 32;

export const AUDIO_BITRATE = 192_000;
export const RATE_MODES = { crf: "crf", size: "size" };

// How many seconds the output will actually cover, which is what the bitrate budget has to
// be divided by. A trim changes it, so the two features interact.
export function resolveOutputSeconds(durationMs, trim) {
  const total = Number(durationMs) / 1000;
  if (!Number.isFinite(total) || total <= 0) return null;

  if (!trim) return total;
  if (trim.duration) return Math.min(trim.duration, Math.max(0, total - trim.start));

  const remaining = total - trim.start;
  return remaining > 0 ? remaining : null;
}

// Splits a size budget into a video bitrate. Returns null when the target cannot be met -
// a tiny target on a long video leaves nothing for video once the audio track is paid for,
// and ffmpeg would either fail or produce something unusable.
export function resolveTargetBitrate({ targetMb, seconds, withAudio = true }) {
  const megabytes = Number(targetMb);
  if (!Number.isFinite(megabytes) || megabytes <= 0) return null;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  const totalBits = megabytes * 1024 * 1024 * 8;
  const audioBits = withAudio ? AUDIO_BITRATE * seconds : 0;
  const videoBitrate = Math.floor((totalBits - audioBits) / seconds);

  // Below this the encoder produces noise rather than a smaller file.
  if (videoBitrate < 1000) return null;

  return videoBitrate;
}

export function clampCrf(value) {
  // Checked before coercion: Number("") and Number(null) are both 0, so a cleared field or
  // a bare `crf=` would silently mean lossless rather than the default.
  if (value === null || value === undefined) return DEFAULT_CRF;
  if (typeof value === "string" && value.trim() === "") return DEFAULT_CRF;

  const crf = Number(value);
  if (!Number.isFinite(crf)) return DEFAULT_CRF;

  return Math.min(Math.max(Math.round(crf), CRF_MIN), CRF_MAX);
}

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
    label: "av1 mp4",
    appliesTo: "video",
    extension: "mp4",
    contentType: "video/mp4",
    // Quality and audio are only adjustable where there is a video encode to adjust:
    // mp3 is audio-only, and jpeg and original have no audio stage at all.
    videoOptions: true,
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
