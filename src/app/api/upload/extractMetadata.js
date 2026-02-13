import ffprobe from "./ffprobe";
import mimetypeToType from "./mimetypeToType";
import sharp from "sharp";
import { fileTypeFromFile } from "file-type";
import { stat } from "fs/promises";

export default async function extractMetadata(filepath) {
  let detectedMime = null;

  try {
    const result = await fileTypeFromFile(filepath);
    detectedMime = result?.mime ?? null;
  } catch { }

  const type = mimetypeToType(detectedMime);

  let dimensions = null;
  let duration = null;
  let size = null;

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

      const streamWithSize = data.streams.find(
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
    mimetype: detectedMime,
    type,
    dimensions,
    duration,
    size,
  };
}
