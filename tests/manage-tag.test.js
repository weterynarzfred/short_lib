import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDb, destroyTempDb } from "./helpers/tempDb";

describe("manageTag", () => {
  let db;
  let tempDir;

  beforeEach(() => {
    vi.resetModules();
    ({ db, tempDir } = createTempDb("short-lib-tag-test-"));
    vi.doMock("@/lib/db", () => ({ default: db }));
  });

  afterEach(() => {
    destroyTempDb({ db, tempDir });
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

  it("rejects an alias that is already a tag name", async () => {
    const catId = db.prepare(`INSERT INTO tags(name) VALUES (?)`).run("cat").lastInsertRowid;
    db.prepare(`INSERT INTO tags(name) VALUES (?)`).run("dog");

    const { addTagAlias } = await import("../src/lib/manageTag");

    expect(() => addTagAlias(catId, "dog")).toThrow(/already a tag name/);
  });

  it("rejects an alias that already points at another tag", async () => {
    const catId = db.prepare(`INSERT INTO tags(name) VALUES (?)`).run("cat").lastInsertRowid;
    const dogId = db.prepare(`INSERT INTO tags(name) VALUES (?)`).run("dog").lastInsertRowid;
    db.prepare(`INSERT INTO tag_aliases(name, tag_id) VALUES (?, ?)`).run("felines", catId);

    const { addTagAlias } = await import("../src/lib/manageTag");

    expect(() => addTagAlias(dogId, "felines")).toThrow(/already an alias of "cat"/);
    expect(db.prepare(`SELECT tag_id FROM tag_aliases WHERE name = ?`).get("felines").tag_id).toBe(catId);
  });

  it("merges into the alias target when renaming a tag onto an alias", async () => {
    const mediaId = db
      .prepare(`INSERT INTO media(file_path, created_at, checksum) VALUES (?, ?, ?)`)
      .run("2026/03/one.jpg", Date.now(), "one").lastInsertRowid;

    const catId = db.prepare(`INSERT INTO tags(name) VALUES (?)`).run("cat").lastInsertRowid;
    const dogId = db.prepare(`INSERT INTO tags(name) VALUES (?)`).run("dog").lastInsertRowid;
    db.prepare(`INSERT INTO tag_aliases(name, tag_id) VALUES (?, ?)`).run("felines", catId);
    db.prepare(`INSERT INTO media_tags(media_id, tag_id) VALUES (?, ?)`).run(mediaId, dogId);

    const { updateTagById } = await import("../src/lib/manageTag");
    const result = updateTagById(dogId, { name: "felines", type: "general" });

    expect(result).toEqual({ mode: "merged", id: catId });
    expect(db.prepare(`SELECT id FROM tags WHERE name = ?`).get("felines")).toBeUndefined();
    expect(db.prepare(`SELECT id FROM tags WHERE id = ?`).get(dogId)).toBeUndefined();
    expect(db.prepare(`SELECT tag_id FROM media_tags WHERE media_id = ?`).all(mediaId))
      .toEqual([{ tag_id: catId }]);
  });

  it("accepts an alias as the implied tag name", async () => {
    const dogId = db.prepare(`INSERT INTO tags(name) VALUES (?)`).run("dog").lastInsertRowid;
    const animalId = db.prepare(`INSERT INTO tags(name) VALUES (?)`).run("animal").lastInsertRowid;
    db.prepare(`INSERT INTO tag_aliases(name, tag_id) VALUES (?, ?)`).run("critter", animalId);

    const { addTagImplicationByName } = await import("../src/lib/manageTag");
    addTagImplicationByName(dogId, "critter");

    expect(db.prepare(`SELECT implied_tag_id FROM tag_implications WHERE tag_id = ?`).all(dogId))
      .toEqual([{ implied_tag_id: animalId }]);
  });
});
