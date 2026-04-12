import path from "path";

import db from "@/lib/db";
import addTags from "@/lib/addTags";
import { getTagTypeOrderSql } from "@/lib/userSettings";
import { markMediaNotesIndexDirty, markTagsIndexDirty } from "@/lib/search";

const STORAGE_DIR = process.env.STORAGE_DIR;

export default async function addMediaToDb(fileData) {
  const insert = db.prepare(`
    INSERT INTO media
    (file_path, created_at, file_size, mime_type, width, height, duration_ms, original_filename, variants, checksum)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectMediaTags = db.prepare(`
    SELECT t.name, t.type
    FROM media_tags mt
    JOIN tags t ON t.id = mt.tag_id
    WHERE mt.media_id = ?
    ORDER BY
      ${getTagTypeOrderSql()},
      t.name COLLATE NOCASE
  `);

  const insertMany = db.transaction(fileData => {
    const insertedMedia = [];

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

      const metaTags = [];

      if (metadata.type) {
        metaTags.push({
          name: metadata.type,
          type: "meta",
        });
      }

      if (metadata.hasAudio) {
        metaTags.push({
          name: "has_audio",
          type: "meta",
        });
      }

      if (metaTags.length > 0) {
        const mediaId = result.lastInsertRowid;
        addTags(mediaId, metaTags);
      }

      const mediaId = Number(result.lastInsertRowid);
      const tags = selectMediaTags.all(mediaId);

      insertedMedia.push({
        id: mediaId,
        originalFilename: metadata.originalFilename,
        filePath: relativePath,
        mimeType: metadata.mimetype,
        tags,
      });
    }

    return insertedMedia;
  });

  const insertedMedia = insertMany(fileData);
  markTagsIndexDirty();
  markMediaNotesIndexDirty();
  return insertedMedia;
}
