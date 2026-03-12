import fs from "fs";
import path from "path";

function getDeletedStorageDir() {
  const storageDir = process.env.STORAGE_DIR;
  if (typeof storageDir !== "string" || storageDir.trim() === "")
    throw new Error("STORAGE_DIR is not configured");

  const storageRoot = path.resolve(storageDir);
  return path.join(storageRoot, "deleted");
}

function collectDeletedStorageStats(deletedDir) {
  if (!fs.existsSync(deletedDir))
    return { removedFiles: 0, removedBytes: 0 };

  let removedFiles = 0;
  let removedBytes = 0;
  const queue = [deletedDir];

  while (queue.length) {
    const currentDir = queue.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (!entry.isFile()) continue;

      removedFiles += 1;
      removedBytes += fs.statSync(entryPath).size;
    }
  }

  return { removedFiles, removedBytes };
}

export default function clearDeletedStorage() {
  const deletedDir = getDeletedStorageDir();
  const stats = collectDeletedStorageStats(deletedDir);

  fs.rmSync(deletedDir, { recursive: true, force: true });
  fs.mkdirSync(deletedDir, { recursive: true });

  return stats;
}
