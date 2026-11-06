import fs from "fs";
import path from "path";
import { Readable } from "stream";
import yazl from "yazl";

import db from "@/lib/db";
import resolveStoragePath from "@/lib/resolveStoragePath";

// Posted by a plain form (`postIds` as a comma list) rather than fetch, so the browser
// streams the response straight to disk instead of holding the whole zip in memory.
export async function POST(req) {
  let postIds;
  try {
    const form = await req.formData();
    postIds = String(form.get("postIds") ?? "").split(",");
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

  // Stored, not deflated: media is already compressed, and an uncompressed zip has a size
  // known up front, so the browser can show real progress. yazl switches to zip64 on its
  // own past 4 GiB.
  const zip = new yazl.ZipFile();
  const seenNames = new Map();
  let fileCount = 0;

  for (const row of rows) {
    const actualPath = resolveStoragePath("full", row.file_path);
    if (!actualPath || !fs.existsSync(actualPath)) continue;

    const filename = path.basename(actualPath);
    const ext = path.extname(filename);
    const rawName = row.original_filename || filename;
    const baseName = path.extname(rawName) ? rawName : rawName + ext;
    const nameBase = path.basename(baseName, path.extname(baseName));
    const nameExt = path.extname(baseName);

    const count = seenNames.get(baseName) ?? 0;
    seenNames.set(baseName, count + 1);
    const uniqueName = count > 0 ? `${nameBase} (${count})${nameExt}` : baseName;

    zip.addFile(actualPath, uniqueName, { compress: false });
    fileCount++;
  }

  if (!fileCount) {
    return new Response("No files found", { status: 404 });
  }

  const finalSize = await new Promise(resolve => zip.end({}, resolve));

  return new Response(Readable.toWeb(zip.outputStream), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": "attachment; filename=\"media.zip\"",
      "Content-Length": String(finalSize),
    },
  });
}
