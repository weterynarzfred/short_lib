import path from "path";

import db from "@/lib/db";
import addTags from "@/lib/addTags";
import { getTagTypeOrderSql } from "@/lib/userSettings";
import { markMediaFilenamesIndexDirty, markMediaNotesIndexDirty } from "@/lib/search";

const STORAGE_DIR = process.env.STORAGE_DIR;

export default async function addMediaToDb(fileData) {
  const insert = db.prepare(`
    INSERT INTO media
    (file_path, created_at, file_size, mime_type, width, height, duration_ms, original_filename, variants, checksum, phash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        metadata.checksum,
        metadata.phash
      );

      const mediaId = Number(result.lastInsertRowid);

      const metaTags = [];
      if (metadata.type) metaTags.push({ name: metadata.type, type: "meta" });
      if (metadata.hasAudio) metaTags.push({ name: "has_audio", type: "meta" });
      if (metaTags.length > 0) addTags(mediaId, metaTags);

      insertedMedia.push({
        id: mediaId,
        originalFilename: metadata.originalFilename,
        filePath: relativePath,
        mimeType: metadata.mimetype,
        tags: selectMediaTags.all(mediaId),
      });
    }

    return insertedMedia;
  });

  const insertedMedia = insertMany(fileData);
  markMediaNotesIndexDirty();
  markMediaFilenamesIndexDirty();
  return insertedMedia;
}
