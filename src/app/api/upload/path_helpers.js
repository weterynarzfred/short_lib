import { mkdirSync } from "fs";
import path from "path";

const STORAGE_DIR = process.env.STORAGE_DIR;

export function getThumbPath(metadata) {
  const year = metadata.uploadDate.getFullYear().toString();
  const month = (metadata.uploadDate.getMonth() + 1).toString().padStart(2, "0");
  const dir = path.join(STORAGE_DIR, "thumbs", year, month);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${metadata.checksum}.jpg`);
}

export function getPrevPath(metadata) {
  const year = metadata.uploadDate.getFullYear().toString();
  const month = (metadata.uploadDate.getMonth() + 1).toString().padStart(2, "0");
  const dir = path.join(STORAGE_DIR, "prevs", year, month);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${metadata.checksum}.jpg`);
}

export function getFinalPath(metadata, ext) {
  const year = metadata.uploadDate.getFullYear().toString();
  const month = (metadata.uploadDate.getMonth() + 1).toString().padStart(2, "0");
  const dir = path.join(STORAGE_DIR, "full", year, month);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${metadata.checksum}${ext}`);
}

export function getTempPath(filename) {
  const dir = path.join(STORAGE_DIR, "tmp");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}
