import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import db from "@/lib/db";
import parseUploadForm from "@/lib/parseUploadForm";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const fileData = await parseUploadForm(req);

    if (!fileData || typeof fileData.entries !== "function") {
      throw new Error("Invalid upload parser result");
    }

    const insert = db.prepare(`
      INSERT INTO media
      (file_path, file_size, mime_type, type, width, height, duration_ms, checksum)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const rows = [];
    const results = [];

    for (const [filename, meta] of fileData.entries()) {
      const stat = await fs.stat(meta.filepath);

      const relativePath = path
        .relative(process.cwd(), meta.filepath)
        .replace(/\\/g, "/");

      rows.push([
        relativePath,
        stat.size,
        meta.mimetype,
        meta.type,
        meta.dimensions?.width,
        meta.dimensions?.height,
        meta.duration,
        meta.checksum,
      ]);

      results.push({
        filename,
        size: stat.size,
        mime: meta.mimetype,
      });
    }

    const insertMany = db.transaction(rows => {
      for (const row of rows)
        insert.run(...row);
    });

    insertMany(rows);


    return NextResponse.json({ files: results });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
