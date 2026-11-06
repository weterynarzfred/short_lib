import { mkdirSync } from "fs";
import path from "path";

const STORAGE_DIR = process.env.STORAGE_DIR;

function getDatedPath(baseDir, metadata, filename) {
  const year = metadata.uploadDate.getFullYear().toString();
  const month = (metadata.uploadDate.getMonth() + 1).toString().padStart(2, "0");
  const dir = path.join(STORAGE_DIR, baseDir, year, month);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}

export function getThumbPath(metadata) {
  return getDatedPath("thumbs", metadata, `${metadata.checksum}.jpg`);
}

export function getVideoPreviewPath(metadata) {
  return getDatedPath("vprevs", metadata, `${metadata.checksum}.mp4`);
}

export function getFinalPath(metadata, ext) {
  return getDatedPath("full", metadata, `${metadata.checksum}${ext}`);
}

export function getTempPath(filename) {
  const dir = path.join(STORAGE_DIR, "tmp");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}
