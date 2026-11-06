import path from "path";

import db from "@/lib/db";
import getDirectoryStats from "@/lib/getDirectoryStats";

// SUM() is NULL on an empty table.
function toNonNegativeInt(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function getStorageStats() {
  const storageDir = process.env.STORAGE_DIR;
  if (typeof storageDir !== "string" || storageDir.trim() === "") {
    const empty = { files: 0, bytes: 0 };
    return {
      configured: false,
      full: empty,
      thumbs: empty,
      videoPreviews: empty,
      deleted: empty,
      active: empty,
    };
  }

  const storageRoot = path.resolve(storageDir);
  const full = getDirectoryStats(path.join(storageRoot, "full"));
  const thumbs = getDirectoryStats(path.join(storageRoot, "thumbs"));
  const videoPreviews = getDirectoryStats(path.join(storageRoot, "vprevs"));
  const deleted = getDirectoryStats(path.join(storageRoot, "deleted"));

  // Every derivative folder counts towards the active total, or the reported library size
  // silently drifts from what is on disk.
  const active = {
    files: full.files + thumbs.files + videoPreviews.files,
    bytes: full.bytes + thumbs.bytes + videoPreviews.bytes,
  };

  return {
    configured: true,
    full,
    thumbs,
    videoPreviews,
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
  `).get();

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
