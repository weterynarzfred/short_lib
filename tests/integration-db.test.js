import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "short-lib-test-"));
  const dbPath = path.join(tempDir, "test.db");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      file_size INTEGER,
      mime_type TEXT,
      width INTEGER,
      height INTEGER,
      duration_ms INTEGER,
      original_filename TEXT,
      variants TEXT CHECK (variants IS NULL OR json_valid(variants)),
      checksum TEXT
    );

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'general'
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

describe("integration: addTags + getPosts", () => {
  let db;
  let tempDir;

  beforeEach(() => {
    vi.resetModules();
    ({ db, tempDir } = createTempDb());
    vi.doMock("@/lib/db", () => ({ default: db }));
  });

  afterEach(() => {
    if (db) db.close();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("filters posts by include and exclude tags", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, variants, checksum)
      VALUES (?, ?, ?, ?)
    `);

    const first = insertMedia.run("2026/03/one.jpg", 1000, null, "one").lastInsertRowid;
    const second = insertMedia.run("2026/03/two.jpg", 2000, '{"thumb":"x"}', "two").lastInsertRowid;

    const { default: addTags } = await import("../src/lib/addTags");
    const { default: getPosts } = await import("../src/app/listing/lib/getPosts");

    addTags(first, [{ name: "red" }, { name: "cat" }]);
    addTags(second, [{ name: "red" }, { name: "dog" }]);

    const posts = getPosts("red -dog");

    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe(first);
    expect(posts[0].variants).toBeNull();
    expect(posts[0].tags.map(t => t.name).sort()).toEqual(["cat", "red"]);
  });

  it("replaces tag links when replace=true", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, variants, checksum)
      VALUES (?, ?, ?, ?)
    `);

    const mediaId = insertMedia.run("2026/03/one.jpg", 3000, null, "one").lastInsertRowid;

    const { default: addTags } = await import("../src/lib/addTags");
    const { default: getPosts } = await import("../src/app/listing/lib/getPosts");

    addTags(mediaId, [{ name: "cat" }, { name: "old" }]);
    addTags(mediaId, [{ name: "new" }], { replace: true });

    expect(getPosts("cat")).toHaveLength(0);
    const posts = getPosts("new");
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe(mediaId);
  });

  it("returns ranked tag suggestions from the API route", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, variants, checksum)
      VALUES (?, ?, ?, ?)
    `);

    const m1 = insertMedia.run("2026/03/one.jpg", 1000, null, "one").lastInsertRowid;
    const m2 = insertMedia.run("2026/03/two.jpg", 2000, null, "two").lastInsertRowid;
    const m3 = insertMedia.run("2026/03/three.jpg", 3000, null, "three").lastInsertRowid;

    const { default: addTags } = await import("../src/lib/addTags");
    addTags(m1, [{ name: "cat", type: "general" }, { name: "car", type: "general" }]);
    addTags(m2, [{ name: "cat", type: "general" }]);
    addTags(m3, [{ name: "car", type: "general" }]);

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=ca"));
    const body = await res.json();

    const dbTags = body.tags.filter(t => t.type !== "operator" && t.type !== "value");
    expect(dbTags).toEqual([
      { id: dbTags[0].id, name: "cat", type: "general", postCount: 2 },
      { id: dbTags[1].id, name: "car", type: "general", postCount: 2 },
    ]);
  });

  it("supports age filters when created_at is stored as unix milliseconds", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, variants, checksum)
      VALUES (?, ?, ?, ?)
    `);

    const nowMs = Date.now();
    const recent = insertMedia.run("2026/03/recent.jpg", nowMs, null, "recent").lastInsertRowid;
    insertMedia.run("2026/03/old.jpg", nowMs - (2 * 24 * 60 * 60 * 1000), null, "old");

    const { default: getPosts } = await import("../src/app/listing/lib/getPosts");

    const recentPosts = getPosts("age:<1h");
    expect(recentPosts).toHaveLength(1);
    expect(recentPosts[0].id).toBe(recent);

    const oldEnoughPosts = getPosts("age:>=1d");
    expect(oldEnoughPosts).toHaveLength(1);
    expect(oldEnoughPosts[0].checksum).toBe("old");
  });
});
