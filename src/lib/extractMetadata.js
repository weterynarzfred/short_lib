import ffprobe from "@/lib/ffprobe";
import mimetypeToType from "@/lib/mimetypeToType";
import sharp from "sharp";

export default async function extractMetadata(filepath, mimetype) {
  const type = mimetypeToType(mimetype);

  let dimensions = null;
  let duration = null;

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

  return { type, dimensions, duration };
}
