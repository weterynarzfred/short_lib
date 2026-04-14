import fs from "fs";
import path from "path";

import db from "@/lib/db";
import { createZip } from "@/lib/createZip";

const STORAGE_DIR = process.env.STORAGE_DIR;

export async function POST(req) {
  let postIds;
  try {
    const body = await req.json();
    postIds = Array.isArray(body.postIds) ? body.postIds : [];
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const ids = [...new Set(
    postIds.map(Number).filter(id => Number.isInteger(id) && id > 0)
  )];

  if (!ids.length) {
    return new Response("No valid post IDs", { status: 400 });
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT id, file_path, original_filename
    FROM media
    WHERE id IN (${placeholders})
  `).all(...ids);

  const files = [];
  const seenNames = new Map();

  for (const row of rows) {
    // file_path is relative from STORAGE_DIR/full, e.g. "2025/01/abc123.jpg"
    const actualPath = path.resolve(STORAGE_DIR, "full", row.file_path);
    // Prevent path traversal
    const base = path.resolve(STORAGE_DIR, "full");
    if (!actualPath.startsWith(base + path.sep) && actualPath !== base) continue;
    if (!fs.existsSync(actualPath)) continue;

    const filename = path.basename(actualPath);
    const ext = path.extname(filename);
    const rawName = row.original_filename || filename;
    const baseName = path.extname(rawName) ? rawName : rawName + ext;
    const nameBase = path.basename(baseName, path.extname(baseName));
    const nameExt = path.extname(baseName);

    const count = seenNames.get(baseName) ?? 0;
    seenNames.set(baseName, count + 1);
    const uniqueName = count > 0 ? `${nameBase} (${count})${nameExt}` : baseName;

    const data = fs.readFileSync(actualPath);
    files.push({ name: uniqueName, data });
  }

  if (!files.length) {
    return new Response("No files found", { status: 404 });
  }

  const zip = createZip(files);

  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": "attachment; filename=\"media.zip\"",
      "Content-Length": zip.length.toString(),
    },
  });
}
