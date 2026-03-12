import fs from "fs";
import path from "path";

import db from "@/lib/db";

function toNonNegativeInt(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function getDirectoryStats(directoryPath) {
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

function getStorageStats() {
  const storageDir = process.env.STORAGE_DIR;
  if (typeof storageDir !== "string" || storageDir.trim() === "") {
    const empty = { files: 0, bytes: 0 };
    return {
      configured: false,
      full: empty,
      thumbs: empty,
      prevs: empty,
      deleted: empty,
      active: empty,
    };
  }

  const storageRoot = path.resolve(storageDir);
  const full = getDirectoryStats(path.join(storageRoot, "full"));
  const thumbs = getDirectoryStats(path.join(storageRoot, "thumbs"));
  const prevs = getDirectoryStats(path.join(storageRoot, "prevs"));
  const deleted = getDirectoryStats(path.join(storageRoot, "deleted"));

  const active = {
    files: full.files + thumbs.files + prevs.files,
    bytes: full.bytes + thumbs.bytes + prevs.bytes,
  };

  return {
    configured: true,
    full,
    thumbs,
    prevs,
    deleted,
    active,
  };
}

export default function getHomeStats() {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total_posts,
      SUM(CASE WHEN m.mime_type LIKE 'image/%' THEN 1 ELSE 0 END) AS image_posts,
      SUM(CASE WHEN m.mime_type LIKE 'video/%' THEN 1 ELSE 0 END) AS video_posts,
      SUM(COALESCE(m.file_size, 0)) AS total_bytes
    FROM media m
  `).get() ?? {};

  const totalPosts = toNonNegativeInt(row.total_posts);
  const imagePosts = toNonNegativeInt(row.image_posts);
  const videoPosts = toNonNegativeInt(row.video_posts);

  return {
    media: {
      totalPosts,
      imagePosts,
      videoPosts,
      otherPosts: Math.max(0, totalPosts - imagePosts - videoPosts),
      totalBytes: toNonNegativeInt(row.total_bytes),
    },
    storage: getStorageStats(),
  };
}
