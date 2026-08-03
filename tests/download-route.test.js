import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDb, destroyTempDb } from "./helpers/tempDb";

describe("single post download route", () => {
  let db;
  let tempDir;
  let storageDir;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();

    ({ db, tempDir } = createTempDb("short-lib-download-"));
    storageDir = fs.mkdtempSync(path.join(tempDir, "storage-"));
    fs.mkdirSync(path.join(storageDir, "full", "2026", "03"), { recursive: true });

    vi.stubEnv("STORAGE_DIR", storageDir);
    vi.doMock("@/lib/db", () => ({ default: db }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    destroyTempDb({ db, tempDir });
  });

  function addMedia({ mimeType, name, relPath = "2026/03/abc.bin", write = true }) {
    if (write) fs.writeFileSync(path.join(storageDir, "full", relPath), "payload");

    return db.prepare(`
      INSERT INTO media (file_path, created_at, checksum, mime_type, original_filename)
      VALUES (?, ?, ?, ?, ?)
    `).run(relPath, 1000, "abc", mimeType, name).lastInsertRowid;
  }

  async function get(query) {
    const { GET } = await import("@/app/api/download/post/route");
    return GET(new Request(`http://localhost/api/download/post?${query}`));
  }

  it("streams the original with an attachment filename", async () => {
    const id = addMedia({ mimeType: "image/png", name: "photo.png" });
    const res = await get(`id=${id}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toContain(`filename="photo.png"`);
    expect(await res.text()).toBe("payload");
  });

  it("rejects an unknown or malformed id", async () => {
    expect((await get("id=0")).status).toBe(400);
    expect((await get("id=abc")).status).toBe(400);
    expect((await get("id=99999")).status).toBe(404);
  });

  it("rejects a preset that does not fit the media type", async () => {
    const id = addMedia({ mimeType: "image/png", name: "photo.png" });

    expect((await get(`id=${id}&preset=av1`)).status).toBe(400);
    expect((await get(`id=${id}&preset=mp3`)).status).toBe(400);
    expect((await get(`id=${id}&preset=nope`)).status).toBe(400);
  });

  it("refuses to trim media without a timeline", async () => {
    const id = addMedia({ mimeType: "image/png", name: "photo.png" });
    const res = await get(`id=${id}&preset=jpeg&start=0:01&end=0:05`);

    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/cannot be trimmed/);
  });

  // An untrimmed copy of the file cannot honour a frame-exact cut.
  it("refuses to trim the original preset", async () => {
    const id = addMedia({ mimeType: "video/mp4", name: "clip.mp4" });
    const res = await get(`id=${id}&preset=original&start=0:01&end=0:05`);

    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/re-encoding preset/);
  });

  it("reports a missing file rather than streaming nothing", async () => {
    const id = addMedia({ mimeType: "image/png", name: "gone.png", write: false });
    expect((await get(`id=${id}`)).status).toBe(404);
  });

  // file_path comes from the database, but a bad value must not escape the media root.
  it("blocks a path that escapes the storage root", async () => {
    const id = addMedia({
      mimeType: "image/png",
      name: "escape.png",
      relPath: "../../outside.png",
      write: false,
    });

    expect((await get(`id=${id}`)).status).toBe(400);
  });

  it("names a converted file after its preset", async () => {
    const id = addMedia({ mimeType: "image/png", name: "photo.png" });
    const res = await get(`id=${id}&preset=jpeg`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("content-disposition")).toContain(`filename="photo.jpg"`);
  });
});
