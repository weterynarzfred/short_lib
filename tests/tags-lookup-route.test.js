import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDb, destroyTempDb } from "./helpers/tempDb";

describe("tag lookup route", () => {
  let db;
  let tempDir;

  beforeEach(() => {
    vi.resetModules();
    ({ db, tempDir } = createTempDb("short-lib-lookup-"));
    vi.doMock("@/lib/db", () => ({ default: db }));
  });

  afterEach(() => {
    destroyTempDb({ db, tempDir });
  });

  function addTag(name, { type = "general", postCount = 0, description = null } = {}) {
    return db.prepare(`
      INSERT INTO tags (name, type, post_count, description) VALUES (?, ?, ?, ?)
    `).run(name, type, postCount, description).lastInsertRowid;
  }

  async function lookup(name) {
    const { GET } = await import("@/app/api/tags/lookup/route");
    const url = `http://localhost/api/tags/lookup?name=${encodeURIComponent(name)}`;
    return (await GET(new Request(url))).json();
  }

  it("returns the tag with its stats and description", async () => {
    addTag("cat", { type: "character", postCount: 12, description: "a small feline" });

    const { tag } = await lookup("cat");

    expect(tag).toMatchObject({
      name: "cat",
      type: "character",
      postCount: 12,
      description: "a small feline",
      aliases: [],
      implications: [],
      matchedAlias: null,
    });
  });

  it("normalises a missing description to an empty string", async () => {
    addTag("cat");
    expect((await lookup("cat")).tag.description).toBe("");
  });

  it("includes aliases and implications", async () => {
    const cat = addTag("cat");
    const animal = addTag("animal");
    db.prepare(`INSERT INTO tag_aliases (name, tag_id) VALUES (?, ?)`).run("felines", cat);
    db.prepare(`INSERT INTO tag_aliases (name, tag_id) VALUES (?, ?)`).run("kitty", cat);
    db.prepare(`
      INSERT INTO tag_implications (tag_id, implied_tag_id) VALUES (?, ?)
    `).run(cat, animal);

    const { tag } = await lookup("cat");

    expect(tag.aliases).toEqual(["felines", "kitty"]);
    expect(tag.implications).toEqual(["animal"]);
  });

  // Hovering an alias should describe the tag it points at, and say so.
  it("resolves an alias to its target", async () => {
    const cat = addTag("cat", { postCount: 3 });
    db.prepare(`INSERT INTO tag_aliases (name, tag_id) VALUES (?, ?)`).run("felines", cat);

    const { tag } = await lookup("felines");

    expect(tag).toMatchObject({ name: "cat", postCount: 3, matchedAlias: "felines" });
  });

  it("returns nothing for an unknown or blank name", async () => {
    addTag("cat");

    expect((await lookup("nope")).tag).toBeNull();
    expect((await lookup("")).tag).toBeNull();
    expect((await lookup("   ")).tag).toBeNull();
  });
});
