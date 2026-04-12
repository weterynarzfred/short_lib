import db from "@/lib/db";
import fs from "fs";
import path from "path";
import { markMediaNotesIndexDirty, markTagsIndexDirty } from "@/lib/search";

const STORAGE_DIR = process.env.STORAGE_DIR;
const DRIVE_PATH_RE = /^[a-zA-Z]:\//;

function parseStoredMediaPath(filePath) {
  const normalized = String(filePath ?? "").trim().replace(/\\/g, "/");
  if (!normalized) throw new Error("Invalid media file path");

  if (normalized.startsWith("/") || normalized.startsWith("//") || DRIVE_PATH_RE.test(normalized))
    throw new Error("Invalid media file path");

  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length) throw new Error("Invalid media file path");
  if (segments.some(segment => segment === "." || segment === ".."))
    throw new Error("Invalid media file path");

  const parsed = path.posix.parse(segments.join("/"));
  if (!parsed.dir || !parsed.name || !parsed.ext)
    throw new Error("Invalid media file path");

  return {
    yearMonthDir: parsed.dir,
    checksum: parsed.name,
    ext: parsed.ext,
  };
}

export default async function deletePost(id) {
  const media = db
    .prepare("SELECT file_path FROM media WHERE id = ?")
    .get(id);

  if (!media) throw new Error("Media not found");

  const { yearMonthDir, checksum, ext } = parseStoredMediaPath(media.file_path);
  const storageRoot = path.resolve(STORAGE_DIR);

  const resolveStoragePath = pathElements => {
    const fullPath = path.resolve(storageRoot, ...pathElements);
    const relative = path.relative(storageRoot, fullPath);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Invalid media file path");
    return fullPath;
  };

  const moveIfExists = pathElements => {
    const src = resolveStoragePath(pathElements);
    if (!fs.existsSync(src)) return;

    const dst = resolveStoragePath(["deleted", ...pathElements]);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(src, dst);
  };

  const getMediaTagIds = db.prepare(`
    SELECT tag_id
    FROM media_tags
    WHERE media_id = ?
  `);

  const decrementTagPostCount = db.prepare(`
    UPDATE tags
    SET post_count = CASE
      WHEN post_count > 0 THEN post_count - 1
      ELSE 0
    END
    WHERE id = ?
  `);

  const tx = db.transaction(() => {
    const linkedTags = getMediaTagIds.all(id);
    for (const row of linkedTags) decrementTagPostCount.run(row.tag_id);

    moveIfExists(["full", yearMonthDir, `${checksum}${ext}`]);
    moveIfExists(["thumbs", yearMonthDir, `${checksum}.jpg`]);
    moveIfExists(["prevs", yearMonthDir, `${checksum}.jpg`]);

    db.prepare("DELETE FROM media WHERE id = ?").run(id);
  });

  tx();
  markTagsIndexDirty();
  markMediaNotesIndexDirty();
}
