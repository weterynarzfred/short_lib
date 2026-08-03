import fs from "fs/promises";
import { spawn } from "child_process";

import processImage from "./processImage";
import generateVideoPreview from "@/lib/generateVideoPreview";
import { getTempPath, getVideoPreviewPath } from "@/app/api/upload/path_helpers";

function extractFrame(input, output, duration) {
  return new Promise((resolve, reject) => {
    const timestampSeconds = (duration * 0.25) / 1000;

    const ff = spawn("ffmpeg", [
      "-y",
      "-ss",
      String(timestampSeconds),
      "-i",
      input,
      "-frames:v",
      "1",
      output,
    ]);

    ff.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error("ffmpeg failed"));
    });
  });
}

export default async function processVideo(metadata) {
  const tempFrame = getTempPath(`${metadata.checksum}-frame.jpg`);

  let variants;
  try {
    await extractFrame(metadata.filepath, tempFrame, metadata.duration);

    variants = await processImage({
      filepath: tempFrame,
      checksum: metadata.checksum,
      uploadDate: metadata.uploadDate,
    });
  } finally {
    await fs.unlink(tempFrame).catch(() => { });
  }

  if (!variants) return variants;

  // A failed preview must not fail the upload: the post is still perfectly usable with
  // just a thumbnail, and the backfill script can fill the gap later.
  try {
    const videoPreview = await generateVideoPreview({
      inputPath: metadata.filepath,
      outputPath: getVideoPreviewPath(metadata),
      durationMs: metadata.duration,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
    });

    if (videoPreview) variants.videoPreview = videoPreview;
  } catch (error) {
    console.error("video preview generation failed:", error);
  }

  return variants;
}
