import fs from "fs";
import path from "path";

// File count and total size under a folder, recursively. A missing folder counts as empty.
export default function getDirectoryStats(directoryPath) {
  if (!fs.existsSync(directoryPath))
    return { files: 0, bytes: 0 };

  let files = 0;
  let bytes = 0;
  const queue = [directoryPath];

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

      files += 1;
      bytes += fs.statSync(entryPath).size;
    }
  }

  return { files, bytes };
}
