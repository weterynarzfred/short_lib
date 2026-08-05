import path from "path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import applySchema from "@/lib/schema";
import resolveDbPath from "@/lib/dbPath";

// The shape these tables had before `notes_md` and `description` were added.
const LEGACY_MEDIA = `
  CREATE TABLE media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    original_filename TEXT,
    variants TEXT,
    checksum TEXT
  );
`;

const LEGACY_TAGS = `
  CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'general',
    post_count INTEGER NOT NULL DEFAULT 0
  );
`;

function columnsOf(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name).sort();
}

function tableNames(db) {
  return db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all().map(row => row.name);
}

function legacyDb() {
  const db = new Database(":memory:");
  db.exec(LEGACY_MEDIA);
  db.exec(LEGACY_TAGS);
  return db;
}

function freshDb() {
  const db = new Database(":memory:");
  applySchema(db);
  return db;
}

describe("applySchema", () => {
  it("adds columns an older database is missing", () => {
    const db = legacyDb();

    expect(columnsOf(db, "media")).not.toContain("notes_md");
    expect(columnsOf(db, "tags")).not.toContain("description");

    applySchema(db);

    expect(columnsOf(db, "media")).toContain("notes_md");
    expect(columnsOf(db, "tags")).toContain("description");
  });

  // Guards against forgetting an ADDED_COLUMNS entry: whatever a fresh database has,
  // a migrated one must have too.
  it("brings an older database to the same columns as a fresh one", () => {
    const migrated = legacyDb();
    applySchema(migrated);
    const fresh = freshDb();

    expect(columnsOf(migrated, "media")).toEqual(columnsOf(fresh, "media"));
    expect(columnsOf(migrated, "tags")).toEqual(columnsOf(fresh, "tags"));
  });

  it("preserves existing rows while migrating", () => {
    const db = legacyDb();
    db.prepare(`
      INSERT INTO media (file_path, created_at, original_filename, checksum)
      VALUES (?, ?, ?, ?)
    `).run("2026/03/one.jpg", 1000, "one.jpg", "abc");
    db.prepare(`INSERT INTO tags (name, post_count) VALUES (?, ?)`).run("cat", 3);

    applySchema(db);

    const media = db.prepare(`SELECT * FROM media`).get();
    expect(media.original_filename).toBe("one.jpg");
    expect(media.checksum).toBe("abc");
    expect(media.notes_md).toBeNull();

    const tag = db.prepare(`SELECT * FROM tags`).get();
    expect(tag.name).toBe("cat");
    expect(tag.post_count).toBe(3);
    expect(tag.description).toBeNull();
  });

  it("is idempotent", () => {
    const db = legacyDb();

    applySchema(db);
    const afterFirst = columnsOf(db, "media");
    expect(() => applySchema(db)).not.toThrow();

    expect(columnsOf(db, "media")).toEqual(afterFirst);
    expect(columnsOf(db, "media").filter(name => name === "notes_md")).toHaveLength(1);
  });

  it("drops retired tables", () => {
    const db = freshDb();
    db.exec(`CREATE TABLE search_repair_queue (id INTEGER PRIMARY KEY, task_type TEXT)`);
    expect(tableNames(db)).toContain("search_repair_queue");

    applySchema(db);

    expect(tableNames(db)).not.toContain("search_repair_queue");
  });

  it("creates every expected table on a fresh database", () => {
    expect(tableNames(freshDb()).sort()).toEqual([
      "media",
      "media_tags",
      "tag_aliases",
      "tag_implications",
      "tags",
      "user_settings",
    ]);
  });
});

describe("db path resolution", () => {
  it("stores shortlib.db in STORAGE_DIR when configured", () => {
    expect(resolveDbPath("./storage"))
      .toBe(path.join(path.resolve("./storage"), "shortlib.db"));
  });

  it("trims surrounding whitespace from STORAGE_DIR", () => {
    expect(resolveDbPath("  ./storage  "))
      .toBe(path.join(path.resolve("./storage"), "shortlib.db"));
  });

  it("falls back to project root when STORAGE_DIR is not configured", () => {
    const expected = path.join(process.cwd(), "shortlib.db");

    expect(resolveDbPath("")).toBe(expected);
    expect(resolveDbPath(undefined)).toBe(expected);
  });
});
