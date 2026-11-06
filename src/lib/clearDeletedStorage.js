import fs from "fs";
import path from "path";

import getDirectoryStats from "@/lib/getDirectoryStats";

function getDeletedStorageDir() {
  const storageDir = process.env.STORAGE_DIR;
  if (typeof storageDir !== "string" || storageDir.trim() === "")
    throw new Error("STORAGE_DIR is not configured");

  return path.join(path.resolve(storageDir), "deleted");
}

export default function clearDeletedStorage() {
  const deletedDir = getDeletedStorageDir();
  const { files, bytes } = getDirectoryStats(deletedDir);

  fs.rmSync(deletedDir, { recursive: true, force: true });
  fs.mkdirSync(deletedDir, { recursive: true });

  return { removedFiles: files, removedBytes: bytes };
}
