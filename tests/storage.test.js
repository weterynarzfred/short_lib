// Everything that moves or counts files on disk: deleting a post, emptying the deleted
// bin, and the storage figures the home page reports.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import { createTempDb, destroyTempDb } from "./helpers/tempDb";

function writeBytes(filePath, size = 1) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.alloc(size, 1));
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
    const videoPreviewPath = path.join(storageDir, "vprevs", yearMonthDir, `${checksum}.mp4`);
    writeBytes(fullPath);
    writeBytes(thumbPath);
    writeBytes(videoPreviewPath);

    const { default: deletePost } = await import("../src/lib/deletePost");
    await deletePost(mediaId);

    expect(fs.existsSync(fullPath)).toBe(false);
    expect(fs.existsSync(thumbPath)).toBe(false);
    expect(fs.existsSync(videoPreviewPath)).toBe(false);

    expect(fs.existsSync(path.join(storageDir, "deleted", "full", yearMonthDir, `${checksum}.mp4`))).toBe(true);
    expect(fs.existsSync(path.join(storageDir, "deleted", "thumbs", yearMonthDir, `${checksum}.jpg`))).toBe(true);
    expect(fs.existsSync(path.join(storageDir, "deleted", "vprevs", yearMonthDir, `${checksum}.mp4`))).toBe(true);

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
    writeBytes(escapedTarget);

    const { default: deletePost } = await import("../src/lib/deletePost");
    await expect(deletePost(mediaId)).rejects.toThrow("Invalid media file path");

    expect(fs.existsSync(escapedTarget)).toBe(true);
    const mediaRow = db.prepare(`SELECT id FROM media WHERE id = ?`).get(mediaId);
    expect(mediaRow).toEqual({ id: mediaId });
  });
});

describe("clearDeletedStorage", () => {
  let storageDir;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "short-lib-clear-deleted-"));
  });

  afterEach(() => {
    if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it("throws when STORAGE_DIR is missing", async () => {
    vi.unstubAllEnvs();
    const { default: clearDeletedStorage } = await import("../src/lib/clearDeletedStorage");

    expect(() => clearDeletedStorage()).toThrow("STORAGE_DIR is not configured");
  });

  it("removes all files inside deleted storage and recreates the directory", async () => {
    vi.stubEnv("STORAGE_DIR", storageDir);

    writeBytes(path.join(storageDir, "deleted", "full", "2026", "03", "a.mp4"), 3);
    writeBytes(path.join(storageDir, "deleted", "thumbs", "2026", "03", "a.jpg"), 5);
    writeBytes(path.join(storageDir, "deleted", "vprevs", "2026", "03", "a.mp4"), 7);
    writeBytes(path.join(storageDir, "full", "2026", "03", "keep.mp4"), 11);

    const { default: clearDeletedStorage } = await import("../src/lib/clearDeletedStorage");
    const result = clearDeletedStorage();

    expect(result).toEqual({ removedFiles: 3, removedBytes: 15 });
    expect(fs.existsSync(path.join(storageDir, "deleted"))).toBe(true);
    expect(fs.existsSync(path.join(storageDir, "full", "2026", "03", "keep.mp4"))).toBe(true);

    const filesLeft = fs.readdirSync(path.join(storageDir, "deleted"));
    expect(filesLeft).toHaveLength(0);
  });

  it("returns zero stats when deleted directory does not exist", async () => {
    vi.stubEnv("STORAGE_DIR", storageDir);

    const { default: clearDeletedStorage } = await import("../src/lib/clearDeletedStorage");
    const result = clearDeletedStorage();

    expect(result).toEqual({ removedFiles: 0, removedBytes: 0 });
    expect(fs.existsSync(path.join(storageDir, "deleted"))).toBe(true);
  });
});

describe("getHomeStats", () => {
  let storageDir;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "short-lib-home-stats-"));
  });

  afterEach(() => {
    if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it("returns aggregated media and storage stats", async () => {
    const db = {
      prepare: vi.fn(() => ({
        get: () => ({
          total_posts: 7,
          image_posts: 4,
          video_posts: 2,
          total_bytes: 8192,
        }),
      })),
    };
    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.stubEnv("STORAGE_DIR", storageDir);

    writeBytes(path.join(storageDir, "full", "2026", "03", "a.mp4"), 11);
    writeBytes(path.join(storageDir, "thumbs", "2026", "03", "a.jpg"), 3);
    writeBytes(path.join(storageDir, "vprevs", "2026", "03", "a.mp4"), 5);
    writeBytes(path.join(storageDir, "deleted", "full", "2026", "03", "a.mp4"), 13);

    const { default: getHomeStats } = await import("../src/lib/getHomeStats");
    const result = getHomeStats();

    expect(result).toEqual({
      media: {
        totalPosts: 7,
        imagePosts: 4,
        videoPosts: 2,
        otherPosts: 1,
        totalBytes: 8192,
      },
      storage: {
        configured: true,
        full: { files: 1, bytes: 11 },
        thumbs: { files: 1, bytes: 3 },
        videoPreviews: { files: 1, bytes: 5 },
        deleted: { files: 1, bytes: 13 },
        active: { files: 3, bytes: 19 },
      },
    });
  });

  it("returns empty storage stats when STORAGE_DIR is missing", async () => {
    const db = {
      prepare: vi.fn(() => ({
        get: () => ({
          total_posts: 0,
          image_posts: 0,
          video_posts: 0,
          total_bytes: 0,
        }),
      })),
    };
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { default: getHomeStats } = await import("../src/lib/getHomeStats");
    const result = getHomeStats();

    expect(result.storage.configured).toBe(false);
    expect(result.storage.active).toEqual({ files: 0, bytes: 0 });
    expect(result.storage.deleted).toEqual({ files: 0, bytes: 0 });
  });
});
