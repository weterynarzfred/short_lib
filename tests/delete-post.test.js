import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import { createTempDb, destroyTempDb } from "./helpers/tempDb";

function writeFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "x");
}

describe("deletePost", () => {
  let db;
  let tempDir;
  let storageRootDir;
  let storageDir;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    ({ db, tempDir } = createTempDb("short-lib-delete-post-"));
    storageRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "short-lib-storage-root-"));
    storageDir = path.join(storageRootDir, "storage");
    fs.mkdirSync(storageDir, { recursive: true });
    vi.stubEnv("STORAGE_DIR", storageDir);
    vi.doMock("@/lib/db", () => ({ default: db }));
  });

  afterEach(() => {
    destroyTempDb({ db, tempDir });
    if (storageRootDir) fs.rmSync(storageRootDir, { recursive: true, force: true });
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

  it("rejects media file paths that attempt to escape storage root", async () => {
    const mediaId = db.prepare(`
      INSERT INTO media (file_path, created_at, checksum)
      VALUES (?, ?, ?)
    `).run("../../outside.mp4", Date.now(), "escape").lastInsertRowid;

    const escapedTarget = path.join(storageRootDir, "outside.mp4");
    writeFile(escapedTarget);

    const { default: deletePost } = await import("../src/lib/deletePost");
    await expect(deletePost(mediaId)).rejects.toThrow("Invalid media file path");

    expect(fs.existsSync(escapedTarget)).toBe(true);
    const mediaRow = db.prepare(`SELECT id FROM media WHERE id = ?`).get(mediaId);
    expect(mediaRow).toEqual({ id: mediaId });
  });
});
