import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import db from "@/lib/db";
import { EXIFTOOL, FFPROBE } from "@/lib/binaries";
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
  const usesProbe = mediaType === "video" || mediaType === "audio";

  try {
    const rows = usesProbe ? await readAvRows(filePath) : await readImageRows(filePath);
    return Response.json({ rows });
  } catch (error) {
    console.error(`reading metadata for media ${id} failed:`, error.message);

    // Say which tool is missing rather than showing an empty section that reads as "this
    // file has no metadata". Worth naming because the app can run under an account that
    // does not see the PATH the tool was installed on.
    const tool = usesProbe ? FFPROBE : EXIFTOOL;
    const message = error.code === "ENOENT"
      ? `${tool} was not found - set FFPROBE_PATH or EXIFTOOL_PATH in .env`
      : "Could not read this file's metadata";

    return Response.json({ error: message }, { status: 500 });
  }
}

async function readAvRows(filePath) {
  const { stdout } = await run(FFPROBE, [
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
  const { stdout } = await run(EXIFTOOL, ["-json", "-G", filePath], {
    maxBuffer: 8_000_000,
  });

  return buildImageInfoRows(JSON.parse(stdout)[0]);
}
