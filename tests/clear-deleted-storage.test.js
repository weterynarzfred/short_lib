import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

function writeBytes(filePath, size) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.alloc(size, 1));
}

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
    writeBytes(path.join(storageDir, "deleted", "prevs", "2026", "03", "a.jpg"), 7);
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
