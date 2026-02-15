import path from "path";

import db from "@/lib/db";
import addTags from "@/lib/addTags";

const STORAGE_DIR = process.env.STORAGE_DIR;

export default async function addMediaToDb(fileData) {
  const insert = db.prepare(`
    INSERT INTO media
    (file_path, created_at, file_size, mime_type, width, height, duration_ms, original_filename, variants, checksum)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(fileData => {
    for (const metadata of fileData.values()) {
      const relativePath = path
        .relative(path.join(STORAGE_DIR, "full"), metadata.filepath)
        .replace(/\\/g, "/");

      const result = insert.run(
        relativePath,
        metadata.uploadDate.getTime(),
        metadata.size,
        metadata.mimetype,
        metadata.dimensions?.width,
        metadata.dimensions?.height,
        metadata.duration,
        metadata.originalFilename,
        JSON.stringify(metadata.variants),
        metadata.checksum
      );

      if (metadata.type) {
        const mediaId = result.lastInsertRowid;
        addTags(mediaId, [
          {
            name: metadata.type,
            type: "meta",
          },
        ]);
      }
    }
  });

  insertMany(fileData);
}
