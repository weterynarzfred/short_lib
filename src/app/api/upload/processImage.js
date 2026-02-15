import sharp from "sharp";

import { getPrevPath, getThumbPath } from "@/app/api/upload/path_helpers";
import scaleToTotalPixels from "@/lib/scaleToTotalPixels";

const THUMB_PIXELS = process.env.THUMB_PIXELS;
const PREVIEW_PIXELS = process.env.PREVIEW_PIXELS;

export default async function processImage(metadata) {
  const image = sharp(metadata.filepath);
  const meta = await image.metadata();

  if (!meta.width || !meta.height) return;

  const thumbSize = scaleToTotalPixels(meta.width, meta.height, THUMB_PIXELS);
  const prevSize = scaleToTotalPixels(meta.width, meta.height, PREVIEW_PIXELS);

  await sharp(metadata.filepath)
    .resize(thumbSize.width, thumbSize.height)
    .jpeg({ quality: 80 })
    .toFile(getThumbPath(metadata));

  await sharp(metadata.filepath)
    .resize(prevSize.width, prevSize.height)
    .jpeg({ quality: 80 })
    .toFile(getPrevPath(metadata));

  return {
    thumb: {
      width: thumbSize.width,
      height: thumbSize.height,
      mimetype: "image/jpeg",
    },
    preview: {
      width: prevSize.width,
      height: prevSize.height,
      mimetype: "image/jpeg",
    },
  };
}
