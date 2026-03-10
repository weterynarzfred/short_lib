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
      notes_md TEXT,
      variants TEXT CHECK (variants IS NULL OR json_valid(variants)),
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

    CREATE VIRTUAL TABLE media_notes_fts
    USING fts5(notes_md, content='media', content_rowid='id');

    CREATE TRIGGER media_notes_fts_ai
    AFTER INSERT ON media
    BEGIN
      INSERT INTO media_notes_fts (rowid, notes_md)
      VALUES (NEW.id, COALESCE(NEW.notes_md, ''));
    END;

    CREATE TRIGGER media_notes_fts_ad
    AFTER DELETE ON media
    BEGIN
      INSERT INTO media_notes_fts (media_notes_fts, rowid, notes_md)
      VALUES ('delete', OLD.id, COALESCE(OLD.notes_md, ''));
    END;

    CREATE TRIGGER media_notes_fts_au
    AFTER UPDATE OF notes_md ON media
    BEGIN
      INSERT INTO media_notes_fts (media_notes_fts, rowid, notes_md)
      VALUES ('delete', OLD.id, COALESCE(OLD.notes_md, ''));
      INSERT INTO media_notes_fts (rowid, notes_md)
      VALUES (NEW.id, COALESCE(NEW.notes_md, ''));
    END;
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

  it("supports pixel, ratio, duration filters and related ordering", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, variants, checksum, width, height, duration_ms, mime_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const nowMs = Date.now();
    const p1 = insertMedia.run(
      "2026/03/p1.jpg",
      nowMs,
      null,
      "p1",
      4000,
      2000,
      120000,
      "image/jpeg"
    ).lastInsertRowid; // 8MP, ratio 2.0, 2m

    const p2 = insertMedia.run(
      "2026/03/p2.jpg",
      nowMs,
      null,
      "p2",
      1920,
      1080,
      30000,
      "image/jpeg"
    ).lastInsertRowid; // ~2.07MP, ratio ~1.78, 30s

    const p3 = insertMedia.run(
      "2026/03/p3.jpg",
      nowMs,
      null,
      "p3",
      1000,
      1000,
      5000,
      "image/jpeg"
    ).lastInsertRowid; // 1MP, ratio 1.0, 5s

    const { default: addTags } = await import("../src/lib/addTags");
    const { default: getPosts } = await import("../src/app/listing/lib/getPosts");

    addTags(p1, [{ name: "a" }, { name: "b" }, { name: "c" }]);
    addTags(p2, [{ name: "a" }, { name: "b" }]);
    addTags(p3, [{ name: "a" }]);

    expect(getPosts("mpixels:>=2").map(p => p.checksum).sort()).toEqual(["p1", "p2"]);
    expect(getPosts("duration:<1m").map(p => p.checksum).sort()).toEqual(["p2", "p3"]);
    expect(getPosts("image_ratio:>=16/9").map(p => p.checksum).sort()).toEqual(["p1", "p2"]);

    expect(getPosts("order:pixelcount limit:3").map(p => p.checksum)).toEqual(["p1", "p2", "p3"]);
    expect(getPosts("order:image_ratio limit:3").map(p => p.checksum)).toEqual(["p1", "p2", "p3"]);
    expect(getPosts("order:tag_count limit:3").map(p => p.checksum)).toEqual(["p1", "p2", "p3"]);
  });

  it("filters posts by notes full-text search", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, notes_md, variants, checksum)
      VALUES (?, ?, ?, ?, ?)
    `);

    const nowMs = Date.now();
    const m1 = insertMedia.run(
      "2026/03/n1.jpg",
      nowMs,
      "quick brown fox jumps",
      null,
      "n1"
    ).lastInsertRowid;
    insertMedia.run(
      "2026/03/n2.jpg",
      nowMs,
      "green turtle swims",
      null,
      "n2"
    );

    const { default: getPosts } = await import("../src/app/listing/lib/getPosts");

    const fox = getPosts("notes:fox");
    expect(fox).toHaveLength(1);
    expect(fox[0].id).toBe(m1);

    const phrase = getPosts("notes:\"quick brown\"");
    expect(phrase).toHaveLength(1);
    expect(phrase[0].id).toBe(m1);
  });

  it("filters tag stats by name and type and exposes known types", async () => {
    db.prepare(`
      INSERT INTO tags (name, type, post_count)
      VALUES (?, ?, ?)
    `).run("cat", "general", 3);
    db.prepare(`
      INSERT INTO tags (name, type, post_count)
      VALUES (?, ?, ?)
    `).run("car", "general", 2);
    db.prepare(`
      INSERT INTO tags (name, type, post_count)
      VALUES (?, ?, ?)
    `).run("camera", "meta", 1);
    db.prepare(`
      INSERT INTO tags (name, type, post_count)
      VALUES (?, ?, ?)
    `).run("artist_name", "creator", 4);

    const { default: getTagStats, getTagTypes } = await import("../src/app/tags/lib/getTagStats");

    const filtered = getTagStats({
      page: 1,
      limit: 50,
      order: "name_asc",
      name: "ca",
      type: "general",
    });

    expect(filtered.total).toBe(2);
    expect(filtered.rows.map(row => row.name)).toEqual(["car", "cat"]);
    expect(getTagTypes()).toEqual(["creator", "general", "meta"]);
  });
});
