import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import parseTagToken from "@/lib/parseTagToken";
import isWithinRect from "@/lib/isWithinRect";
import { createTempDb, destroyTempDb } from "./helpers/tempDb";

// Decides when an open tooltip closes. Without the padding the few pixels between a tag
// and its card are a dead zone, and the card closes before its link can be clicked.
describe("isWithinRect", () => {
  const rect = { top: 100, bottom: 120, left: 200, right: 300 };

  it("accepts points inside and on the edges", () => {
    expect(isWithinRect(rect, 250, 110, 0)).toBe(true);
    expect(isWithinRect(rect, 200, 100, 0)).toBe(true);
    expect(isWithinRect(rect, 300, 120, 0)).toBe(true);
  });

  it("rejects points outside", () => {
    expect(isWithinRect(rect, 250, 130, 0)).toBe(false);
    expect(isWithinRect(rect, 199, 110, 0)).toBe(false);
  });

  it("bridges the gap below a tag with padding", () => {
    // The card sits 6px under the anchor; without slack this point closes it.
    expect(isWithinRect(rect, 250, 126, 0)).toBe(false);
    expect(isWithinRect(rect, 250, 126, 12)).toBe(true);
  });

  it("still rejects points beyond the padding", () => {
    expect(isWithinRect(rect, 250, 140, 12)).toBe(false);
  });

  it("treats a missing rect as not containing anything", () => {
    expect(isWithinRect(null, 250, 110, 12)).toBe(false);
    expect(isWithinRect(undefined, 250, 110, 12)).toBe(false);
  });
});

describe("parseTagToken", () => {
  it("reads a bare tag", () => {
    expect(parseTagToken("cat")).toEqual({ name: "cat", type: "", negated: false });
  });

  it("reads a typed tag", () => {
    expect(parseTagToken("meta:image"))
      .toEqual({ name: "image", type: "meta", negated: false });
  });

  it("reads negation", () => {
    expect(parseTagToken("-cat")).toEqual({ name: "cat", type: "", negated: true });
    expect(parseTagToken("-meta:image"))
      .toEqual({ name: "image", type: "meta", negated: true });
  });

  // A colon at either end belongs to the name, matching parseTagString.
  it("treats an edge colon as part of the name", () => {
    expect(parseTagToken(":cat")).toMatchObject({ name: ":cat", type: "" });
    expect(parseTagToken("cat:")).toMatchObject({ name: "cat:", type: "" });
  });

  it("keeps later colons in the name", () => {
    expect(parseTagToken("series:one:two"))
      .toEqual({ name: "one:two", type: "series", negated: false });
  });

  it("survives empty input", () => {
    expect(parseTagToken("")).toEqual({ name: "", type: "", negated: false });
    expect(parseTagToken(null)).toEqual({ name: "", type: "", negated: false });
    expect(parseTagToken(undefined)).toEqual({ name: "", type: "", negated: false });
    expect(parseTagToken("  cat  ")).toMatchObject({ name: "cat" });
  });
});

// The hover hook finds tags by querying `span.token` and reading textContent. That is an
// assumption about markup this project does not generate itself, so it is pinned here:
// if prism's output shape changes, hovering silently stops working with nothing else
// failing.
describe("tag token markup", () => {
  it("renders each tag as a token span carrying the raw text", async () => {
    const { highlightText, languages } = await import("prism-code-editor/prism");
    // Registers languages.tags as a side effect.
    await import("@/lib/tagsLanguage");

    const html = highlightText("cat meta:image -dog", languages.tags);

    expect(html).toContain(`<span class="token tag-type-general">cat</span>`);
    expect(html).toContain(`<span class="token tag-type-meta">meta:image</span>`);
    expect(html).toContain(`<span class="token tag-type-general">-dog</span>`);
  });

  it("leaves whitespace outside the token spans", async () => {
    const { highlightText, languages } = await import("prism-code-editor/prism");
    // Registers languages.tags as a side effect.
    await import("@/lib/tagsLanguage");

    const html = highlightText("cat dog", languages.tags);

    // A span whose text is only whitespace would become a hoverable dead zone.
    expect(html).not.toMatch(/<span class="token[^"]*">\s+<\/span>/);
  });
});

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
