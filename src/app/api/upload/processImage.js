import sharp from "sharp";

import { getThumbPath } from "@/app/api/upload/path_helpers";
import scaleToTotalPixels from "@/lib/scaleToTotalPixels";

const THUMB_PIXELS = process.env.THUMB_PIXELS;

// sharp refuses anything over 268 MP by default as a guard against decompression bombs.
// Every image here is one I chose to upload, so huge scans and panoramas are let through
// (as in the jpeg download), at the cost of briefly using a lot of RAM.
export default async function processImage(metadata) {
  const meta = await sharp(metadata.filepath, { limitInputPixels: false }).metadata();

  if (!meta.width || !meta.height) return;

  const thumbSize = scaleToTotalPixels(meta.width, meta.height, THUMB_PIXELS);

  await sharp(metadata.filepath, { limitInputPixels: false })
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
