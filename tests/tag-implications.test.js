import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDb, destroyTempDb } from "./helpers/tempDb";

describe("tag implications", () => {
  let db;
  let tempDir;

  beforeEach(() => {
    vi.resetModules();
    ({ db, tempDir } = createTempDb("short-lib-implications-"));
    vi.doMock("@/lib/db", () => ({ default: db }));
  });

  afterEach(() => {
    destroyTempDb({ db, tempDir });
  });

  function addTag(name, postCount = 0) {
    return db.prepare(`INSERT INTO tags (name, post_count) VALUES (?, ?)`)
      .run(name, postCount).lastInsertRowid;
  }

  function addMedia(checksum) {
    return db.prepare(`
      INSERT INTO media (file_path, created_at, checksum) VALUES (?, ?, ?)
    `).run(`2026/03/${checksum}.jpg`, 1000, checksum).lastInsertRowid;
  }

  function link(mediaId, tagId) {
    db.prepare(`INSERT INTO media_tags (media_id, tag_id) VALUES (?, ?)`).run(mediaId, tagId);
    db.prepare(`UPDATE tags SET post_count = post_count + 1 WHERE id = ?`).run(tagId);
  }

  function imply(tagId, impliedTagId) {
    db.prepare(`
      INSERT INTO tag_implications (tag_id, implied_tag_id) VALUES (?, ?)
    `).run(tagId, impliedTagId);
  }

  function tagNamesOf(mediaId) {
    return db.prepare(`
      SELECT t.name FROM media_tags mt JOIN tags t ON t.id = mt.tag_id
      WHERE mt.media_id = ? ORDER BY t.name
    `).all(mediaId).map(row => row.name);
  }

  const postCountOf = name =>
    db.prepare(`SELECT post_count FROM tags WHERE name = ?`).get(name).post_count;

  describe("applyTagImplications", () => {
    it("adds implied tags to posts that already had the source tag", async () => {
      const cat = addTag("cat");
      addTag("animal");
      const media = addMedia("a");
      link(media, cat);
      imply(cat, db.prepare(`SELECT id FROM tags WHERE name='animal'`).get().id);

      const { default: applyTagImplications } = await import("@/lib/applyTagImplications");
      const result = applyTagImplications();

      expect(tagNamesOf(media)).toEqual(["animal", "cat"]);
      expect(result).toEqual({ linksAdded: 1, tagsUpdated: 1 });
    });

    it("follows chains transitively", async () => {
      const cat = addTag("cat");
      const feline = addTag("feline");
      const animal = addTag("animal");
      const media = addMedia("a");
      link(media, cat);
      imply(cat, feline);
      imply(feline, animal);

      const { default: applyTagImplications } = await import("@/lib/applyTagImplications");
      applyTagImplications();

      expect(tagNamesOf(media)).toEqual(["animal", "cat", "feline"]);
    });

    // Posts holding only a tag further up the chain must be reached too.
    it("reaches posts that never held the source tag directly", async () => {
      const kitten = addTag("kitten");
      const cat = addTag("cat");
      const animal = addTag("animal");
      const media = addMedia("a");
      link(media, kitten);
      imply(kitten, cat);
      imply(cat, animal);

      const { default: applyTagImplications } = await import("@/lib/applyTagImplications");
      applyTagImplications();

      expect(tagNamesOf(media)).toEqual(["animal", "cat", "kitten"]);
    });

    it("keeps post_count exact", async () => {
      const cat = addTag("cat");
      const animal = addTag("animal");
      const first = addMedia("a");
      const second = addMedia("b");
      link(first, cat);
      link(second, cat);
      imply(cat, animal);

      const { default: applyTagImplications } = await import("@/lib/applyTagImplications");
      applyTagImplications();

      expect(postCountOf("cat")).toBe(2);
      expect(postCountOf("animal")).toBe(2);

      const stale = db.prepare(`
        SELECT COUNT(*) n FROM tags t
        WHERE t.post_count <> (SELECT COUNT(*) FROM media_tags mt WHERE mt.tag_id = t.id)
      `).get().n;
      expect(stale).toBe(0);
    });

    it("is idempotent", async () => {
      const cat = addTag("cat");
      const animal = addTag("animal");
      link(addMedia("a"), cat);
      imply(cat, animal);

      const { default: applyTagImplications } = await import("@/lib/applyTagImplications");

      expect(applyTagImplications().linksAdded).toBe(1);
      expect(applyTagImplications()).toEqual({ linksAdded: 0, tagsUpdated: 0 });
      expect(postCountOf("animal")).toBe(1);
    });

    it("does nothing when there are no implications", async () => {
      link(addMedia("a"), addTag("cat"));

      const { default: applyTagImplications } = await import("@/lib/applyTagImplications");
      expect(applyTagImplications()).toEqual({ linksAdded: 0, tagsUpdated: 0 });
    });

    // The recursion must terminate even on a graph that should not exist.
    it("terminates on a cycle", async () => {
      const a = addTag("a");
      const b = addTag("b");
      const media = addMedia("a");
      link(media, a);
      imply(a, b);
      imply(b, a);

      const { default: applyTagImplications } = await import("@/lib/applyTagImplications");
      expect(() => applyTagImplications()).not.toThrow();
      expect(tagNamesOf(media)).toEqual(["a", "b"]);
    });
  });

  describe("addTagImplicationByName", () => {
    it("creates the implied tag when it does not exist", async () => {
      const cat = addTag("cat");
      const { addTagImplicationByName } = await import("@/lib/manageTag");

      addTagImplicationByName(cat, "animal");

      const animal = db.prepare(`SELECT id, type FROM tags WHERE name = ?`).get("animal");
      expect(animal).toBeDefined();
      expect(animal.type).toBe("general");
    });

    it("backfills existing posts when the implication is added", async () => {
      const cat = addTag("cat");
      const first = addMedia("a");
      const second = addMedia("b");
      link(first, cat);
      link(second, cat);

      const { addTagImplicationByName } = await import("@/lib/manageTag");
      const result = addTagImplicationByName(cat, "animal");

      expect(tagNamesOf(first)).toEqual(["animal", "cat"]);
      expect(tagNamesOf(second)).toEqual(["animal", "cat"]);
      expect(result.linksAdded).toBe(2);
      expect(postCountOf("animal")).toBe(2);
    });

    it("rejects an implication that would close a cycle", async () => {
      const cat = addTag("cat");
      const animal = addTag("animal");
      imply(cat, animal);

      const { addTagImplicationByName } = await import("@/lib/manageTag");

      expect(() => addTagImplicationByName(animal, "cat"))
        .toThrow(/already implies/);
      expect(db.prepare(`SELECT COUNT(*) n FROM tag_implications`).get().n).toBe(1);
    });

    it("rejects a cycle formed through a chain", async () => {
      const a = addTag("a");
      const b = addTag("b");
      const c = addTag("c");
      imply(a, b);
      imply(b, c);

      const { addTagImplicationByName } = await import("@/lib/manageTag");

      expect(() => addTagImplicationByName(c, "a")).toThrow(/already implies/);
    });

    it("still rejects a tag implying itself", async () => {
      const cat = addTag("cat");
      const { addTagImplicationByName } = await import("@/lib/manageTag");

      expect(() => addTagImplicationByName(cat, "cat")).toThrow(/cannot imply itself/);
    });

    it("leaves the tags in place when the implication is removed", async () => {
      const cat = addTag("cat");
      const media = addMedia("a");
      link(media, cat);

      const { addTagImplicationByName, removeTagImplication } = await import("@/lib/manageTag");
      addTagImplicationByName(cat, "animal");

      const animalId = db.prepare(`SELECT id FROM tags WHERE name='animal'`).get().id;
      removeTagImplication(cat, animalId);

      expect(tagNamesOf(media)).toEqual(["animal", "cat"]);
      expect(db.prepare(`SELECT COUNT(*) n FROM tag_implications`).get().n).toBe(0);
    });
  });
});
