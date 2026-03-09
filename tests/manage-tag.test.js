import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "short-lib-tag-test-"));
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

describe("manageTag", () => {
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

  it("updates tag type without renaming", async () => {
    const tagId = db
      .prepare(`INSERT INTO tags(name, type) VALUES (?, ?)`)
      .run("cat", "general").lastInsertRowid;

    const { updateTagById } = await import("../src/lib/manageTag");
    const result = updateTagById(tagId, { name: "cat", type: "meta" });

    const updated = db.prepare(`SELECT name, type FROM tags WHERE id = ?`).get(tagId);

    expect(result.mode).toBe("updated");
    expect(updated).toEqual({ name: "cat", type: "meta" });
  });

  it("renames a tag and preserves links when target name does not exist", async () => {
    const mediaId = db
      .prepare(`INSERT INTO media(file_path, created_at, checksum) VALUES (?, ?, ?)`)
      .run("2026/03/one.jpg", Date.now(), "a").lastInsertRowid;

    const tagId = db
      .prepare(`INSERT INTO tags(name, type) VALUES (?, ?)`)
      .run("cat", "general").lastInsertRowid;

    db.prepare(`INSERT INTO media_tags(media_id, tag_id) VALUES (?, ?)`)
      .run(mediaId, tagId);

    const { updateTagById } = await import("../src/lib/manageTag");
    const result = updateTagById(tagId, { name: "kitty", type: "creator" });

    const renamed = db.prepare(`SELECT id, name, type FROM tags WHERE id = ?`).get(tagId);
    const linkCount = db.prepare(`SELECT COUNT(*) AS n FROM media_tags WHERE tag_id = ?`).get(tagId).n;

    expect(result.mode).toBe("renamed");
    expect(renamed).toEqual({ id: tagId, name: "kitty", type: "creator" });
    expect(linkCount).toBe(1);
  });

  it("merges tags when renaming to an existing name and de-duplicates links", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media(file_path, created_at, checksum)
      VALUES (?, ?, ?)
    `);

    const firstMediaId = insertMedia.run("2026/03/one.jpg", Date.now(), "one").lastInsertRowid;
    const secondMediaId = insertMedia.run("2026/03/two.jpg", Date.now(), "two").lastInsertRowid;

    const sourceId = db
      .prepare(`INSERT INTO tags(name, type) VALUES (?, ?)`)
      .run("cat", "general").lastInsertRowid;

    const targetId = db
      .prepare(`INSERT INTO tags(name, type) VALUES (?, ?)`)
      .run("dog", "meta").lastInsertRowid;

    db.prepare(`INSERT INTO media_tags(media_id, tag_id) VALUES (?, ?)`).run(firstMediaId, sourceId);
    db.prepare(`INSERT INTO media_tags(media_id, tag_id) VALUES (?, ?)`).run(secondMediaId, sourceId);
    db.prepare(`INSERT INTO media_tags(media_id, tag_id) VALUES (?, ?)`).run(secondMediaId, targetId);

    const { updateTagById } = await import("../src/lib/manageTag");
    const result = updateTagById(sourceId, { name: "dog", type: "creator" });

    const allTags = db.prepare(`SELECT id, name, type FROM tags ORDER BY id ASC`).all();
    const links = db.prepare(`
      SELECT media_id, tag_id
      FROM media_tags
      ORDER BY media_id, tag_id
    `).all();

    expect(result).toEqual({ mode: "merged", id: targetId });
    expect(allTags).toEqual([{ id: targetId, name: "dog", type: "meta" }]);
    expect(links).toEqual([
      { media_id: firstMediaId, tag_id: targetId },
      { media_id: secondMediaId, tag_id: targetId },
    ]);
  });

  it("deletes a tag and cascades tag links", async () => {
    const mediaId = db
      .prepare(`INSERT INTO media(file_path, created_at, checksum) VALUES (?, ?, ?)`)
      .run("2026/03/one.jpg", Date.now(), "one").lastInsertRowid;

    const tagId = db
      .prepare(`INSERT INTO tags(name, type) VALUES (?, ?)`)
      .run("cat", "general").lastInsertRowid;

    db.prepare(`INSERT INTO media_tags(media_id, tag_id) VALUES (?, ?)`).run(mediaId, tagId);

    const { deleteTagById } = await import("../src/lib/manageTag");
    const deleted = deleteTagById(tagId);

    const tagCount = db.prepare(`SELECT COUNT(*) AS n FROM tags WHERE id = ?`).get(tagId).n;
    const linkCount = db.prepare(`SELECT COUNT(*) AS n FROM media_tags WHERE tag_id = ?`).get(tagId).n;

    expect(deleted).toBe(true);
    expect(tagCount).toBe(0);
    expect(linkCount).toBe(0);
  });
});
