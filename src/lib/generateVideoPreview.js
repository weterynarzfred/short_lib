import { spawn } from "child_process";

import scaleToTotalPixels from "./scaleToTotalPixels.js";
import { FFMPEG, FFPROBE } from "./binaries.js";

// Deliberately free of "@/" imports: the backfill script runs under plain node, which does
// not resolve the jsconfig alias.

// A total-pixel budget rather than a width cap, so a tall video gets the same number of
// pixels as a wide one. Capping width alone gave a 9:16 clip 480x854 - four times the
// pixels of a 16:9 clip at the same setting.
export const DEFAULT_PREVIEW_PIXELS = 100_000;
export const PREVIEW_SEGMENTS = 4;
export const PREVIEW_SEGMENT_SECONDS = 2.5;
export const PREVIEW_TOTAL_SECONDS = PREVIEW_SEGMENTS * PREVIEW_SEGMENT_SECONDS;

// Sampled from the middle 90%, so a preview does not open on a title card or end on
// credits. Anything at or under the total length is used whole instead of sampled.
export function planPreviewSegments(durationSeconds) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) return null;

  if (duration <= PREVIEW_TOTAL_SECONDS)
    return [{ start: 0, duration }];

  const usableStart = duration * 0.05;
  const usableLength = duration * 0.9;
  const step = (usableLength - PREVIEW_SEGMENT_SECONDS) / (PREVIEW_SEGMENTS - 1);

  return Array.from({ length: PREVIEW_SEGMENTS }, (_, index) => ({
    start: Number((usableStart + step * index).toFixed(3)),
    duration: PREVIEW_SEGMENT_SECONDS,
  }));
}

// yuv420p needs both dimensions even, and scaleToTotalPixels rounds to whole pixels only.
// Rounded *down*, so evening the numbers can never push the result past the budget.
function toEven(value) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

export function planPreviewSize(width, height, targetPixels = DEFAULT_PREVIEW_PIXELS) {
  const sourceWidth = Number(width);
  const sourceHeight = Number(height);
  const budget = Number(targetPixels);

  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)) return null;
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  if (!Number.isFinite(budget) || budget <= 0) return null;

  // Never upscales: scaleToTotalPixels returns the source size when it already fits.
  const scaled = scaleToTotalPixels(sourceWidth, sourceHeight, budget);

  return { width: toEven(scaled.width), height: toEven(scaled.height) };
}

export function buildPreviewArgs(inputPath, outputPath, segments, size) {
  const args = ["-v", "error", "-nostdin", "-y"];

  // Seeking before each -i is what keeps this fast on long files: ffmpeg jumps to each
  // segment instead of decoding everything up to it.
  for (const segment of segments) {
    args.push("-ss", String(segment.start), "-t", String(segment.duration), "-i", inputPath);
  }

  const labels = segments.map((_, index) => `[${index}:v]`).join("");
  // Explicit dimensions rather than a filter expression: the budget maths lives in
  // planPreviewSize, where it is testable and shared with the image thumbnails.
  const filter =
    `${labels}concat=n=${segments.length}:v=1:a=0,scale=${size.width}:${size.height}[out]`;

  args.push(
    "-filter_complex", filter,
    "-map", "[out]",
    "-c:v", "libsvtav1",
    // Cheaper than the download preset: this is a hover thumbnail, and it runs across the
    // whole library.
    "-crf", "40",
    "-preset", "10",
    "-pix_fmt", "yuv420p",
    // Silent by design - browsers block autoplay with sound, and it halves the size.
    "-an",
    "-movflags", "+faststart",
    outputPath
  );

  return args;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);

    let stderr = "";
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
      if (stderr.length > 8192) stderr = stderr.slice(-8192);
    });

    let stdout = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });

    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

async function probeDimensions(filePath) {
  const output = await run(FFPROBE, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0",
    filePath,
  ]);

  const [width, height] = output.split(",").map(part => Number(part.trim()));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

  return { width, height };
}

// Writes a short silent AV1 clip sampled from across the video. Returns the variant entry
// to store, or null when the source has no usable duration.
export default async function generateVideoPreview({
  inputPath,
  outputPath,
  durationMs,
  sourceWidth,
  sourceHeight,
  targetPixels = Number(process.env.THUMB_PIXELS) || DEFAULT_PREVIEW_PIXELS,
}) {
  const segments = planPreviewSegments(Number(durationMs) / 1000);
  if (!segments) return null;

  // Callers normally know the dimensions already - uploads from probing, the backfill from
  // the database - so probing is only a fallback.
  const source = planPreviewSize(sourceWidth, sourceHeight, targetPixels)
    ? { width: Number(sourceWidth), height: Number(sourceHeight) }
    : await probeDimensions(inputPath);

  const size = planPreviewSize(source?.width, source?.height, targetPixels);
  if (!size) return null;

  await run(FFMPEG, buildPreviewArgs(inputPath, outputPath, segments, size));

  return {
    width: size.width,
    height: size.height,
    mimetype: "video/mp4",
  };
}
