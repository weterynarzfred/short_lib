"use server";

import db from "@/lib/db";
import fs from "fs";
import path from "path";

const STORAGE_DIR = process.env.STORAGE_DIR;

export default async function deletePost(id) {
  const media = db
    .prepare("SELECT file_path FROM media WHERE id = ?")
    .get(id);

  if (!media) throw new Error("Media not found");

  const parsed = path.parse(media.file_path);
  const yearMonthDir = parsed.dir;
  const checksum = parsed.name;
  const ext = parsed.ext;

  const moveIfExists = pathElements => {
    const src = path.join(STORAGE_DIR, ...pathElements);
    if (!fs.existsSync(src)) return;

    const dst = path.join(STORAGE_DIR, "deleted", ...pathElements);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(src, dst);
  };

  const tx = db.transaction(() => {
    moveIfExists(["full", yearMonthDir, `${checksum}${ext}`]);
    moveIfExists(["thumbs", yearMonthDir, `${checksum}.jpg`]);
    moveIfExists(["prevs", yearMonthDir, `${checksum}.jpg`]);

    db.prepare("DELETE FROM media WHERE id = ?").run(id);
  });

  tx();
}
