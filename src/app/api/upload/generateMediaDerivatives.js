import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { spawn } from "child_process";

const THUMB_DIR = path.join(process.cwd(), "storage", "thumbs");
const PREV_DIR = path.join(process.cwd(), "storage", "prevs");

const THUMB_PIXELS = 100_000;     // 0.1 Mpx
const PREVIEW_PIXELS = 1_000_000; // 1 Mpx

function getTargetSize(width, height, targetPixels) {
  const sourcePixels = width * height;

  if (sourcePixels <= targetPixels) {
    return { width, height };
  }

  const scale = Math.sqrt(targetPixels / sourcePixels);

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}


export default async function generateMediaDerivatives(fileData) {
  await fs.mkdir(THUMB_DIR, { recursive: true });
  await fs.mkdir(PREV_DIR, { recursive: true });

  for (const [filename, metadata] of fileData.entries()) {
    const { mimetype, filepath } = metadata;

    if (!filepath || !mimetype) continue;

    if (mimetype.startsWith("image/")) {
      await processImage(filepath, filename);
    }

    if (mimetype.startsWith("video/")) {
      await processVideo(filepath, filename, metadata);
    }
  }
}

/* ---------------- IMAGE ---------------- */

async function processImage(filepath, filename) {
  const image = sharp(filepath);
  const meta = await image.metadata();

  if (!meta.width || !meta.height) return;

  const thumbSize = getTargetSize(meta.width, meta.height, THUMB_PIXELS);
  const prevSize = getTargetSize(meta.width, meta.height, PREVIEW_PIXELS);

  const thumbPath = path.join(THUMB_DIR, `${filename}.jpg`);
  const prevPath = path.join(PREV_DIR, `${filename}.jpg`);

  await sharp(filepath)
    .resize(thumbSize.width, thumbSize.height)
    .jpeg({ quality: 80 })
    .toFile(thumbPath);

  await sharp(filepath)
    .resize(prevSize.width, prevSize.height)
    .jpeg({ quality: 80 })
    .toFile(prevPath);
}

/* ---------------- VIDEO ---------------- */

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

async function processVideo(filepath, filename, metadata) {
  const tempFrame = path.join(process.cwd(), "storage", `${filename}-frame.jpg`);

  await extractFrame(filepath, tempFrame, metadata.duration);

  const image = sharp(tempFrame);
  const meta = await image.metadata();

  if (!meta.width || !meta.height) {
    await fs.unlink(tempFrame).catch(() => { });
    return;
  }

  const thumbSize = getTargetSize(meta.width, meta.height, THUMB_PIXELS);
  const prevSize = getTargetSize(meta.width, meta.height, PREVIEW_PIXELS);

  const thumbPath = path.join(THUMB_DIR, `${filename}.jpg`);
  const prevPath = path.join(PREV_DIR, `${filename}.jpg`);

  await sharp(tempFrame)
    .resize(thumbSize.width, thumbSize.height)
    .jpeg({ quality: 80 })
    .toFile(thumbPath);

  await sharp(tempFrame)
    .resize(prevSize.width, prevSize.height)
    .jpeg({ quality: 80 })
    .toFile(prevPath);

  await fs.unlink(tempFrame).catch(() => { });
}
