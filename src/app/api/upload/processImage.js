import sharp from "sharp";

import { getThumbPath } from "@/app/api/upload/path_helpers";
import scaleToTotalPixels from "@/lib/scaleToTotalPixels";

const THUMB_PIXELS = process.env.THUMB_PIXELS;

// The 1 Mpx `prevs/` JPEG this used to also write was never displayed anywhere, so it is
// no longer generated. Existing files remain on disk; PREVIEW_PIXELS is now unused.
export default async function processImage(metadata) {
  const image = sharp(metadata.filepath);
  const meta = await image.metadata();

  if (!meta.width || !meta.height) return;

  const thumbSize = scaleToTotalPixels(meta.width, meta.height, THUMB_PIXELS);

  await sharp(metadata.filepath)
    .resize(thumbSize.width, thumbSize.height)
    .jpeg({ quality: 80 })
    .toFile(getThumbPath(metadata));

  return {
    thumb: {
      width: thumbSize.width,
      height: thumbSize.height,
      mimetype: "image/jpeg",
    },
  };
}
