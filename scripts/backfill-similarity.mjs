// One-time backfill of perceptual hashes for posts uploaded before `similar:` existed.
//
//   npm run backfill:similar
//
// Resumable: a post is skipped once it has a hash, so an interrupted run can simply be
// repeated. Pass --force to rehash everything.

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

import resolveDbPath from "../src/lib/dbPath.js";
import { hashImage, hashVideo } from "../src/lib/perceptualHash.js";
import resolveStoragePath from "../src/lib/resolveStoragePath.js";
import applySchema from "../src/lib/schema.js";

if (!process.env.STORAGE_DIR) {
  console.error("STORAGE_DIR is not set. Run through: npm run backfill:similar");
  process.exit(1);
}

const force = process.argv.includes("--force");
const db = new Database(resolveDbPath());
// The app adds the phash column on start, but this may run before the app has restarted.
applySchema(db);

const posts = db.prepare(`
  SELECT id, file_path, mime_type
  FROM media
  WHERE (mime_type LIKE 'image/%' OR mime_type LIKE 'video/%')
    AND TRIM(COALESCE(file_path, '')) <> ''
    ${force ? "" : "AND phash IS NULL"}
  ORDER BY id ASC
`).all();

const updateHash = db.prepare(`UPDATE media SET phash = ? WHERE id = ?`);

let done = 0;
let failed = 0;
const startedAt = Date.now();

for (const [index, post] of posts.entries()) {
  const position = `[${String(index + 1).padStart(String(posts.length).length)}/${posts.length}]`;
  const name = path.basename(post.file_path);
  const inputPath = resolveStoragePath("full", post.file_path);

  if (!inputPath || !fs.existsSync(inputPath)) {
    failed += 1;
    console.warn(`${position} missing source  ${name}`);
    continue;
  }

  try {
    const hash = post.mime_type.startsWith("video/")
      ? await hashVideo(inputPath)
      : await hashImage(inputPath);

    // Written per post rather than at the end, so an interrupted run keeps what it did.
    updateHash.run(hash, post.id);

    done += 1;
    console.log(`${position} ${String(hash.length / 8).padStart(5)} frames  ${name}`);
  } catch (error) {
    failed += 1;
    // Left NULL for a later run rather than aborting: one unreadable file should not stop 2000.
    console.warn(`${position} failed         ${name}: ${String(error.message).split("\n")[0]}`);
  }
}

const elapsed = Math.round((Date.now() - startedAt) / 1000);
console.log(`\nhashed ${done}, failed ${failed} in ${elapsed}s`);

db.close();
