import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import backupDbIfDue from "@/lib/backupDb";
import { createTempDb, destroyTempDb } from "./helpers/tempDb";

describe("backupDbIfDue", () => {
  let temp;
  let dbPath;
  let backupDir;

  const listBackups = () => fs.readdirSync(backupDir).sort();
  const seedBackups = dates => {
    fs.mkdirSync(backupDir, { recursive: true });
    for (const date of dates) fs.writeFileSync(path.join(backupDir, `shortlib-${date}.db`), "");
  };

  beforeEach(() => {
    temp = createTempDb();
    dbPath = path.join(temp.tempDir, "test.db");
    backupDir = path.join(temp.tempDir, "backups");
    temp.db.prepare("INSERT INTO tags (name) VALUES ('kept')").run();
  });

  afterEach(() => destroyTempDb(temp));

  it("writes a readable copy when there is no backup yet", async () => {
    const file = await backupDbIfDue({ dbPath, now: new Date(2026, 9, 28, 23, 30) });

    expect(file).toBe(path.join(backupDir, "shortlib-2026-10-28.db"));
    expect(listBackups()).toEqual(["shortlib-2026-10-28.db"]);

    const copy = new Database(file, { readonly: true });
    expect(copy.prepare("SELECT name FROM tags").pluck().all()).toContain("kept");
    copy.close();
  });

  it("skips until the newest backup is three days old", async () => {
    seedBackups(["2026-10-26"]);

    expect(await backupDbIfDue({ dbPath, now: new Date(2026, 9, 28) })).toBeNull();
    expect(await backupDbIfDue({ dbPath, now: new Date(2026, 9, 29) })).not.toBeNull();
  });

  it("keeps the newest ten and ignores files it did not name", async () => {
    seedBackups(Array.from({ length: 10 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`));
    fs.writeFileSync(path.join(backupDir, "shortlib-backup.partial"), "torn");
    fs.writeFileSync(path.join(backupDir, "manual-copy.db"), "");

    await backupDbIfDue({ dbPath, now: new Date(2026, 9, 28) });

    const backups = listBackups().filter(name => /^shortlib-\d/.test(name));
    expect(backups).toHaveLength(10);
    expect(backups[0]).toBe("shortlib-2026-09-02.db");
    expect(backups.at(-1)).toBe("shortlib-2026-10-28.db");
    expect(listBackups()).toContain("manual-copy.db");
    expect(listBackups()).not.toContain("shortlib-backup.partial");
  });
});
