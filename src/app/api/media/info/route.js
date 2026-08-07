import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import db from "@/lib/db";
import mimetypeToType from "@/lib/mimetypeToType";
import { buildAvInfoRows, buildImageInfoRows } from "@/lib/mediaInfoFields";

const run = promisify(execFile);

const STORAGE_DIR = process.env.STORAGE_DIR;

const selectMedia = db.prepare(`
  SELECT file_path, mime_type
  FROM media
  WHERE id = ?
`);

// Read on demand rather than stored: exiftool answers in about a third of a second, the
// files never change once uploaded, and a column would need a backfill to be worth anything.
export async function GET(req) {
  if (!STORAGE_DIR) return Response.json({ error: "Storage is not configured" }, { status: 500 });

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0)
    return Response.json({ error: "Bad request" }, { status: 400 });

  const media = selectMedia.get(id);
  if (!media) return Response.json({ error: "Not found" }, { status: 404 });

  const base = path.resolve(STORAGE_DIR, "full");
  const filePath = path.resolve(base, media.file_path);
  if (!filePath.startsWith(base + path.sep))
    return Response.json({ error: "Bad request" }, { status: 400 });
  if (!fs.existsSync(filePath))
    return Response.json({ error: "The file is missing from storage" }, { status: 404 });

  const mediaType = mimetypeToType(media.mime_type);
  const readRows = mediaType === "video" || mediaType === "audio" ? readAvRows : readImageRows;

  try {
    return Response.json({ rows: await readRows(filePath) });
  } catch (error) {
    // Almost always a missing binary, which is worth saying out loud rather than showing an
    // empty section that looks like the file has no metadata.
    console.error(`reading metadata for media ${id} failed:`, error.message);
    return Response.json({ error: "Could not read this file's metadata" }, { status: 500 });
  }
}

async function readAvRows(filePath) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath,
  ], { maxBuffer: 8_000_000 });

  return buildAvInfoRows(JSON.parse(stdout));
}

async function readImageRows(filePath) {
  // Grouped names (`File:`, `EXIF:`, `PNG:`) because the same fact lands in different
  // groups per format, and the field list keys off those names.
  const { stdout } = await run("exiftool", ["-json", "-G", filePath], {
    maxBuffer: 8_000_000,
  });

  return buildImageInfoRows(JSON.parse(stdout)[0]);
}
