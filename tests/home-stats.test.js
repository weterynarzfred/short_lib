import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

function writeBytes(filePath, size) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.alloc(size, 1));
}

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
