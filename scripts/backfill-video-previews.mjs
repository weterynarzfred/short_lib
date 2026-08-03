// One-time backfill of hover previews for videos uploaded before the feature existed.
//
//   npm run backfill:previews
//
// Resumable: a post whose preview file already exists is skipped, so an interrupted run
// can simply be repeated. Pass --force to regenerate everything.

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

import resolveDbPath from "../src/lib/dbPath.js";
import generateVideoPreview from "../src/lib/generateVideoPreview.js";

const STORAGE_DIR = process.env.STORAGE_DIR;
if (!STORAGE_DIR) {
  console.error("STORAGE_DIR is not set. Run through: npm run backfill:previews");
  process.exit(1);
}

const force = process.argv.includes("--force");
const db = new Database(resolveDbPath());

const videos = db.prepare(`
  SELECT id, file_path, duration_ms, width, height, variants
  FROM media
  WHERE mime_type LIKE 'video/%'
    AND TRIM(COALESCE(file_path, '')) <> ''
  ORDER BY id ASC
`).all();

const updateVariants = db.prepare(`UPDATE media SET variants = ? WHERE id = ?`);

function previewPathFor(filePath) {
  const parsed = path.parse(filePath);
  const dir = path.resolve(STORAGE_DIR, "vprevs", parsed.dir);
  fs.mkdirSync(dir, { recursive: true });

  return path.join(dir, `${parsed.name}.mp4`);
}

function parseVariants(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let done = 0;
let skipped = 0;
let failed = 0;
const startedAt = Date.now();

for (const [index, video] of videos.entries()) {
  const position = `[${String(index + 1).padStart(String(videos.length).length)}/${videos.length}]`;
  const name = path.basename(video.file_path);
  const outputPath = previewPathFor(video.file_path);

  // Both must be true to skip. Keying on the file alone left a post stranded when a run
  // was killed between writing the clip and recording it: the file existed, so every
  // later run skipped it, and the row never gained its variant.
  const alreadyRecorded = Boolean(parseVariants(video.variants).videoPreview);
  if (!force && alreadyRecorded && fs.existsSync(outputPath)) {
    skipped += 1;
    continue;
  }

  const inputPath = path.resolve(STORAGE_DIR, "full", video.file_path);
  if (!fs.existsSync(inputPath)) {
    failed += 1;
    console.warn(`${position} missing source  ${name}`);
    continue;
  }

  try {
    const videoPreview = await generateVideoPreview({
      inputPath,
      outputPath,
      durationMs: video.duration_ms,
      sourceWidth: video.width,
      sourceHeight: video.height,
    });

    if (!videoPreview) {
      failed += 1;
      console.warn(`${position} no duration    ${name}`);
      continue;
    }

    // Written per post rather than at the end, so an interrupted run leaves the rows it
    // finished already consistent with the files on disk.
    updateVariants.run(
      JSON.stringify({ ...parseVariants(video.variants), videoPreview }),
      video.id
    );

    done += 1;
    console.log(`${position} ok             ${name}`);
  } catch (error) {
    failed += 1;
    // Left for a later run rather than aborting: one unreadable file should not stop 500.
    fs.rmSync(outputPath, { force: true });
    console.warn(`${position} failed         ${name}: ${String(error.message).split("\n")[0]}`);
  }
}

const elapsed = Math.round((Date.now() - startedAt) / 1000);
console.log(`\ngenerated ${done}, skipped ${skipped}, failed ${failed} in ${elapsed}s`);

db.close();
