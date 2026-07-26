import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDb, destroyTempDb } from "./helpers/tempDb";

describe("addTags", () => {
  let db;
  let tempDir;

  beforeEach(() => {
    vi.resetModules();
    ({ db, tempDir } = createTempDb("short-lib-add-tags-"));
    vi.doMock("@/lib/db", () => ({ default: db }));
  });

  afterEach(() => {
    destroyTempDb({ db, tempDir });
  });

  function insertMedia(checksum) {
    return db.prepare(`
      INSERT INTO media (file_path, created_at, checksum)
      VALUES (?, ?, ?)
    `).run(`2026/03/${checksum}.jpg`, Date.now(), checksum).lastInsertRowid;
  }

  function insertTag(name, type = "general", postCount = 0) {
    return db.prepare(`
      INSERT INTO tags (name, type, post_count)
      VALUES (?, ?, ?)
    `).run(name, type, postCount).lastInsertRowid;
  }

  function getTag(name) {
    return db.prepare(`SELECT id, name, type, post_count FROM tags WHERE name = ?`).get(name);
  }

  function getLinkedTagNames(mediaId) {
    return db.prepare(`
      SELECT t.name
      FROM media_tags mt
      JOIN tags t ON t.id = mt.tag_id
      WHERE mt.media_id = ?
      ORDER BY t.name
    `).all(mediaId).map(row => row.name);
  }

  it("parses typed and untyped tokens from a tag string", async () => {
    const { parseTagString } = await import("../src/lib/addTags");

    expect(parseTagString("meta:image  plain  series:one:two")).toEqual([
      { name: "image", type: "meta" },
      { name: "plain" },
      { name: "one:two", type: "series" },
    ]);
  });

  it("replaces existing media tags and updates type when needed", async () => {
    const mediaId = insertMedia("a");
    const staleTagId = insertTag("stale", "general", 1);
    insertTag("cat", "general");
    db.prepare(`INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)`).run(mediaId, staleTagId);

    const { default: addTags } = await import("../src/lib/addTags");
    addTags(mediaId, [{ name: "cat", type: "meta" }, { name: "new-tag" }], { replace: true });

    expect(getLinkedTagNames(mediaId)).toEqual(["cat", "new-tag"]);
    expect(getTag("cat").type).toBe("meta");
    expect(getTag("new-tag").type).toBe("general");
    expect(getTag("stale").post_count).toBe(0);
    expect(getTag("cat").post_count).toBe(1);
  });

  it("clears links when replace=true and tag input is empty", async () => {
    const mediaId = insertMedia("b");
    const tagId = insertTag("cat", "general", 1);
    db.prepare(`INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)`).run(mediaId, tagId);

    const { default: addTags } = await import("../src/lib/addTags");
    addTags(mediaId, [], { replace: true });

    expect(getLinkedTagNames(mediaId)).toEqual([]);
    expect(getTag("cat").post_count).toBe(0);
  });

  it("does not double-count a tag that is already linked", async () => {
    const mediaId = insertMedia("c");
    const tagId = insertTag("cat", "general", 1);
    db.prepare(`INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)`).run(mediaId, tagId);

    const { default: addTags } = await import("../src/lib/addTags");
    addTags(mediaId, [{ name: "cat" }], { replace: false });

    expect(getLinkedTagNames(mediaId)).toEqual(["cat"]);
    expect(getTag("cat").post_count).toBe(1);
  });

  it("links transitively implied tags", async () => {
    const mediaId = insertMedia("d");
    const catId = insertTag("cat");
    const felineId = insertTag("feline");
    const animalId = insertTag("animal");

    const implies = db.prepare(`
      INSERT INTO tag_implications (tag_id, implied_tag_id)
      VALUES (?, ?)
    `);
    implies.run(catId, felineId);
    implies.run(felineId, animalId);

    const { default: addTags } = await import("../src/lib/addTags");
    addTags(mediaId, [{ name: "cat" }], { replace: false });

    expect(getLinkedTagNames(mediaId)).toEqual(["animal", "cat", "feline"]);
    expect(getTag("animal").post_count).toBe(1);
    expect(getTag("feline").post_count).toBe(1);
  });

  it("links the target tag when an alias is typed, without creating a tag", async () => {
    const mediaId = insertMedia("f");
    const catId = insertTag("cat");
    db.prepare(`INSERT INTO tag_aliases (name, tag_id) VALUES (?, ?)`).run("felines", catId);

    const { default: addTags } = await import("../src/lib/addTags");
    addTags(mediaId, [{ name: "felines" }], { replace: false });

    expect(getLinkedTagNames(mediaId)).toEqual(["cat"]);
    expect(getTag("felines")).toBeUndefined();
    expect(getTag("cat").post_count).toBe(1);
  });

  it("applies a type given alongside an alias to the target tag", async () => {
    const mediaId = insertMedia("g");
    const catId = insertTag("cat", "general");
    db.prepare(`INSERT INTO tag_aliases (name, tag_id) VALUES (?, ?)`).run("felines", catId);

    const { default: addTags } = await import("../src/lib/addTags");
    addTags(mediaId, [{ name: "felines", type: "meta" }], { replace: false });

    expect(getTag("cat").type).toBe("meta");
    expect(getTag("felines")).toBeUndefined();
  });

  it("follows implications of the tag an alias points at", async () => {
    const mediaId = insertMedia("h");
    const catId = insertTag("cat");
    const animalId = insertTag("animal");
    db.prepare(`INSERT INTO tag_aliases (name, tag_id) VALUES (?, ?)`).run("felines", catId);
    db.prepare(`INSERT INTO tag_implications (tag_id, implied_tag_id) VALUES (?, ?)`).run(catId, animalId);

    const { default: addTags } = await import("../src/lib/addTags");
    addTags(mediaId, [{ name: "felines" }], { replace: false });

    expect(getLinkedTagNames(mediaId)).toEqual(["animal", "cat"]);
  });

  it("removeTags unlinks the target tag when given an alias", async () => {
    const mediaId = insertMedia("i");
    const catId = insertTag("cat", "general", 1);
    db.prepare(`INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)`).run(mediaId, catId);
    db.prepare(`INSERT INTO tag_aliases (name, tag_id) VALUES (?, ?)`).run("felines", catId);

    const { removeTags } = await import("../src/lib/addTags");
    removeTags(mediaId, [{ name: "felines" }]);

    expect(getLinkedTagNames(mediaId)).toEqual([]);
    expect(getTag("cat").post_count).toBe(0);
  });

  it("removeTags unlinks matching tags and decrements post counts", async () => {
    const mediaId = insertMedia("e");
    const catId = insertTag("cat", "general", 2);
    const dogId = insertTag("dog", "general", 3);
    const link = db.prepare(`INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)`);
    link.run(mediaId, catId);
    link.run(mediaId, dogId);

    const { removeTags } = await import("../src/lib/addTags");
    removeTags(mediaId, [{ name: "cat" }, { name: "missing" }]);

    expect(getLinkedTagNames(mediaId)).toEqual(["dog"]);
    expect(getTag("cat").post_count).toBe(1);
    expect(getTag("dog").post_count).toBe(3);
  });
});
