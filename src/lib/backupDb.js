import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import resolveDbPath from "@/lib/dbPath";

const EVERY_DAYS = 3;
const KEEP = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const BACKUP_NAME = /^shortlib-(\d{4}-\d{2}-\d{2})\.db$/;

// Local calendar date, so a backup taken late in the evening is named for that evening.
function formatDate(date) {
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Copies the database into backups/ next to it when the newest copy is at least EVERY_DAYS
// old, keeping the newest KEEP. Returns the new file's path, or null when none was due.
export default async function backupDbIfDue({ dbPath = resolveDbPath(), now = new Date() } = {}) {
  const backupDir = path.join(path.dirname(dbPath), "backups");
  fs.mkdirSync(backupDir, { recursive: true });

  // ISO dates sort chronologically, so the last name is the newest backup.
  const existing = fs.readdirSync(backupDir).filter(name => BACKUP_NAME.test(name)).sort();
  const today = formatDate(now);
  const newest = existing.at(-1);
  if (newest && Date.parse(today) - Date.parse(newest.match(BACKUP_NAME)[1]) < EVERY_DAYS * DAY_MS)
    return null;

  // Written under a fixed temporary name and renamed once complete. A stop mid-copy would
  // otherwise leave a broken file that passes for the newest backup and skips the next ones.
  const partial = path.join(backupDir, "shortlib-backup.partial");
  const target = path.join(backupDir, `shortlib-${today}.db`);
  fs.rmSync(partial, { force: true });

  // Its own read-only connection, so no schema setup runs. backup() takes a consistent
  // snapshot even if the app writes in the middle of it.
  const source = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(partial);
  } finally {
    source.close();
  }
  fs.renameSync(partial, target);

  for (const name of [...existing, path.basename(target)].slice(0, -KEEP))
    fs.rmSync(path.join(backupDir, name));

  return target;
}
