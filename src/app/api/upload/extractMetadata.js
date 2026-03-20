import ffprobe from "./ffprobe";
import mimetypeToType from "./mimetypeToType";
import sharp from "sharp";
import { fileTypeFromFile } from "file-type";
import { open, stat } from "fs/promises";
import { lookup as lookupMimeType } from "mime-types";
import { isText } from "istextorbinary";

const GENERIC_MIME_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
  "application/unknown",
]);

function normalizeMimeType(rawValue) {
  if (typeof rawValue !== "string") return "";
  const value = rawValue.trim().toLowerCase();
  if (!value) return "";
  if (!value.includes("/")) return "";
  return value;
}

function isGenericMimeType(mimeType) {
  return GENERIC_MIME_TYPES.has(mimeType);
}

async function detectTextFile(filepath) {
  const byFilename = isText(filepath);
  if (typeof byFilename === "boolean") return byFilename;

  let fileHandle = null;
  try {
    fileHandle = await open(filepath, "r");
    const sample = Buffer.alloc(4096);
    const { bytesRead } = await fileHandle.read(sample, 0, sample.length, 0);
    if (!bytesRead) return null;
    return isText(filepath, sample.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    if (!fileHandle) return;
    try {
      await fileHandle.close();
    } catch { }
  }
}

async function resolveMimeType(filepath, fallbackMimeType, detectedMime) {
  const normalizedDetected = normalizeMimeType(detectedMime);
  if (normalizedDetected && !isGenericMimeType(normalizedDetected))
    return normalizedDetected;

  const extensionGuess = normalizeMimeType(lookupMimeType(filepath));
  if (extensionGuess && !isGenericMimeType(extensionGuess))
    return extensionGuess;

  const normalizedFallback = normalizeMimeType(fallbackMimeType);
  if (normalizedFallback && !isGenericMimeType(normalizedFallback))
    return normalizedFallback;

  const isTextFile = await detectTextFile(filepath);
  if (isTextFile)
    return extensionGuess || "text/plain";

  if (extensionGuess) return extensionGuess;
  if (normalizedDetected) return normalizedDetected;
  if (normalizedFallback) return normalizedFallback;

  return "application/octet-stream";
}

export default async function extractMetadata(filepath, { fallbackMimeType } = {}) {
  let detectedMime = "";

  try {
    const result = await fileTypeFromFile(filepath);
    detectedMime = result?.mime ?? "";
  } catch { }

  const mimetype = await resolveMimeType(filepath, fallbackMimeType, detectedMime);
  const type = mimetypeToType(mimetype);

  let dimensions = null;
  let duration = null;
  let size = null;
  let hasAudio = false;

  try {
    const fileStats = await stat(filepath);
    size = fileStats.size;
  } catch { }

  if (type === "image") {
    try {
      const meta = await sharp(filepath).metadata();
      if (meta.width && meta.height) {
        dimensions = {
          width: meta.width,
          height: meta.height,
        };
      }
    } catch { }
  }

  if (type === "video" || type === "audio") {
    try {
      const data = await ffprobe(filepath);
      const streams = Array.isArray(data.streams) ? data.streams : [];

      if (type === "video")
        hasAudio = streams.some(stream => stream.codec_type === "audio");

      const streamWithSize = streams.find(
        s => s.width && s.height
      );

      if (streamWithSize) {
        dimensions = {
          width: streamWithSize.width,
          height: streamWithSize.height,
        };
      }

      if (data.format?.duration) {
        duration = Math.round(
          parseFloat(data.format.duration) * 1000
        );
      }
    } catch { }
  }

  return {
    mimetype,
    type,
    dimensions,
    duration,
    size,
    hasAudio,
  };
}
