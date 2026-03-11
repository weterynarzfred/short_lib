import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "short-lib-delete-post-"));
  const dbPath = path.join(tempDir, "test.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum TEXT
    );

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'general',
      post_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE media_tags (
      media_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (media_id, tag_id),
      FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
  `);

  return { db, tempDir };
}

function writeFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "x");
}

describe("deletePost", () => {
  let db;
  let tempDir;
  let storageDir;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    ({ db, tempDir } = createTempDb());
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "short-lib-storage-"));
    vi.stubEnv("STORAGE_DIR", storageDir);
    vi.doMock("@/lib/db", () => ({ default: db }));
  });

  afterEach(() => {
    if (db) db.close();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it("moves media files to deleted storage and decrements linked tag post counts", async () => {
    const checksum = "a".repeat(64);
    const yearMonthDir = "2026/03";
    const relativeMediaPath = `${yearMonthDir}/${checksum}.mp4`;
    const mediaId = db.prepare(`
      INSERT INTO media (file_path, created_at, checksum)
      VALUES (?, ?, ?)
    `).run(relativeMediaPath, Date.now(), checksum).lastInsertRowid;

    const firstTagId = db.prepare(`
      INSERT INTO tags (name, type, post_count)
      VALUES (?, ?, ?)
    `).run("cat", "general", 2).lastInsertRowid;
    const secondTagId = db.prepare(`
      INSERT INTO tags (name, type, post_count)
      VALUES (?, ?, ?)
    `).run("dog", "general", 1).lastInsertRowid;

    db.prepare(`INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)`).run(mediaId, firstTagId);
    db.prepare(`INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)`).run(mediaId, secondTagId);

    const fullPath = path.join(storageDir, "full", yearMonthDir, `${checksum}.mp4`);
    const thumbPath = path.join(storageDir, "thumbs", yearMonthDir, `${checksum}.jpg`);
    const prevPath = path.join(storageDir, "prevs", yearMonthDir, `${checksum}.jpg`);
    writeFile(fullPath);
    writeFile(thumbPath);
    writeFile(prevPath);

    const { default: deletePost } = await import("../src/lib/deletePost");
    await deletePost(mediaId);

    expect(fs.existsSync(fullPath)).toBe(false);
    expect(fs.existsSync(thumbPath)).toBe(false);
    expect(fs.existsSync(prevPath)).toBe(false);

    expect(fs.existsSync(path.join(storageDir, "deleted", "full", yearMonthDir, `${checksum}.mp4`))).toBe(true);
    expect(fs.existsSync(path.join(storageDir, "deleted", "thumbs", yearMonthDir, `${checksum}.jpg`))).toBe(true);
    expect(fs.existsSync(path.join(storageDir, "deleted", "prevs", yearMonthDir, `${checksum}.jpg`))).toBe(true);

    const postCountFirst = db.prepare(`SELECT post_count FROM tags WHERE id = ?`).get(firstTagId).post_count;
    const postCountSecond = db.prepare(`SELECT post_count FROM tags WHERE id = ?`).get(secondTagId).post_count;
    const mediaRow = db.prepare(`SELECT id FROM media WHERE id = ?`).get(mediaId);
    const linksLeft = db.prepare(`SELECT COUNT(*) AS n FROM media_tags WHERE media_id = ?`).get(mediaId).n;

    expect(postCountFirst).toBe(1);
    expect(postCountSecond).toBe(0);
    expect(mediaRow).toBeUndefined();
    expect(linksLeft).toBe(0);
  });

  it("throws when media id is missing", async () => {
    const { default: deletePost } = await import("../src/lib/deletePost");
    await expect(deletePost(99999)).rejects.toThrow("Media not found");
  });
});
