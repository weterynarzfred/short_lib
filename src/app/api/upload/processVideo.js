import fs from "fs/promises";
import { spawn } from "child_process";

import processImage from "./processImage";
import { getTempPath } from "@/app/api/upload/path_helpers";

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
  await extractFrame(metadata.filepath, tempFrame, metadata.duration);

  const variants = await processImage({
    filepath: tempFrame,
    checksum: metadata.checksum,
    uploadDate: metadata.uploadDate,
  });

  await fs.unlink(tempFrame).catch(() => { });

  return variants;
}
