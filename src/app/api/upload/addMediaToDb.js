import path from "path";

import db from "@/lib/db";

export default async function addMediaToDb(fileData) {
  const insert = db.prepare(`
    INSERT INTO media
    (file_path, file_size, mime_type, width, height, duration_ms, checksum)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const results = [];
  const rows = [];

  for (const [filename, meta] of fileData.entries()) {
    const relativePath = path
      .relative(process.cwd(), meta.filepath)
      .replace(/\\/g, "/");

    rows.push([
      relativePath,
      meta.size,
      meta.mimetype,
      meta.dimensions?.width,
      meta.dimensions?.height,
      meta.duration,
      meta.checksum,
    ]);

    results.push({
      filename,
      size: meta.size,
      mime: meta.mimetype,
    });
  }

  const insertMany = db.transaction(rows => {
    for (const row of rows)
      insert.run(...row);
  });

  insertMany(rows);
}
