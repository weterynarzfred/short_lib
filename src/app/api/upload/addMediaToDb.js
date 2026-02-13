import path from "path";

import db from "@/lib/db";
import addTags from "@/lib/addTags";

export default async function addMediaToDb(fileData) {
  const insert = db.prepare(`
    INSERT INTO media
    (file_path, file_size, mime_type, width, height, duration_ms, checksum)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(fileData => {
    for (const fileMeta of fileData.values()) {
      const relativePath = path
        .relative(process.cwd(), fileMeta.filepath)
        .replace(/\\/g, "/");

      const result = insert.run(
        relativePath,
        fileMeta.size,
        fileMeta.mimetype,
        fileMeta.dimensions?.width,
        fileMeta.dimensions?.height,
        fileMeta.duration,
        fileMeta.checksum
      );

      if (fileMeta.type) {
        const mediaId = result.lastInsertRowid;
        addTags(mediaId, [
          {
            name: fileMeta.type,
            type: "meta",
          },
        ]);
      }
    }
  });

  insertMany(fileData);
}
