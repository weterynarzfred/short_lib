import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDb, destroyTempDb } from "./helpers/tempDb";

describe("integration: addTags + getPosts", () => {
  let db;
  let tempDir;

  beforeEach(() => {
    vi.resetModules();
    ({ db, tempDir } = createTempDb());
    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({
      markMediaNotesIndexDirty: vi.fn(),
      searchTagSuggestions: vi.fn(async (query, { limit = 16 } = {}) => {
        const safeQuery = String(query ?? "").trim();
        if (!safeQuery) return [];

        const rows = db.prepare(`
          SELECT id, name, type, post_count
          FROM tags
          WHERE name LIKE ? || '%'
          ORDER BY post_count DESC, id ASC
          LIMIT ?
        `).all(safeQuery, limit);

        return rows.map(row => ({
          id: row.id,
          name: row.name,
          type: row.type,
          postCount: row.post_count,
        }));
      }),
      searchMediaIdsByNotes: vi.fn(async query => matchColumns(query, ["notes_md"])),
      searchMediaIdsByFilename: vi.fn(async query => matchColumns(query, ["original_filename"])),
      // Mirrors the real per-field rule: all terms in notes, or all in the filename.
      searchMediaIdsByText: vi.fn(async query =>
        [...new Set([
          ...matchColumns(query, ["notes_md"]),
          ...matchColumns(query, ["original_filename"]),
        ])]),
    }));

    function matchColumns(query, columns) {
      const terms = String(query ?? "")
        .trim()
        .split(/\s+/)
        .map(token => token.trim().toLowerCase())
        .filter(Boolean);
      if (!terms.length) return [];

      const where = [];
      const params = [];

      for (const term of terms) {
        where.push(`(${columns
          .map(column => `LOWER(COALESCE(${column}, '')) LIKE ?`)
          .join(" OR ")})`);
        for (const _ of columns) params.push(`%${term}%`);
      }

      return db.prepare(`
        SELECT id
        FROM media
        WHERE ${where.join(" AND ")}
        ORDER BY id ASC
        LIMIT 10000
      `).all(...params).map(row => row.id);
    }
  });

  afterEach(() => {
    destroyTempDb({ db, tempDir });
  });

  it("filters posts by include and exclude tags", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, variants, checksum)
      VALUES (?, ?, ?, ?)
    `);

    const first = insertMedia.run("2026/03/one.jpg", 1000, null, "one").lastInsertRowid;
    const second = insertMedia.run("2026/03/two.jpg", 2000, '{"thumb":"x"}', "two").lastInsertRowid;

    const { default: addTags } = await import("../src/lib/addTags");
    const { default: getPosts } = await import("../src/lib/listingQuery/getPosts");

    addTags(first, [{ name: "red" }, { name: "cat" }]);
    addTags(second, [{ name: "red" }, { name: "dog" }]);

    const posts = await getPosts("red -dog");

    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe(first);
    expect(posts[0].variants).toBeNull();
    expect(posts[0].tags.map(t => t.name).sort()).toEqual(["cat", "red"]);
  });

  it("finds posts when searching by a tag alias", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, variants, checksum)
      VALUES (?, ?, ?, ?)
    `);

    const first = insertMedia.run("2026/03/one.jpg", 1000, null, "one").lastInsertRowid;
    const second = insertMedia.run("2026/03/two.jpg", 2000, null, "two").lastInsertRowid;

    const { default: addTags } = await import("../src/lib/addTags");
    const { default: getPosts } = await import("../src/lib/listingQuery/getPosts");

    addTags(first, [{ name: "cat" }]);
    addTags(second, [{ name: "dog" }]);

    const catId = db.prepare(`SELECT id FROM tags WHERE name = ?`).get("cat").id;
    db.prepare(`INSERT INTO tag_aliases (name, tag_id) VALUES (?, ?)`).run("felines", catId);

    const posts = await getPosts("felines");
    expect(posts.map(post => post.id)).toEqual([first]);

    const negated = await getPosts("-felines");
    expect(negated.map(post => post.id)).toEqual([second]);
  });

  it("resolves blacklisted tag aliases, but lets an explicit search override them", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, variants, checksum)
      VALUES (?, ?, ?, ?)
    `);

    const mediaId = insertMedia.run("2026/03/one.jpg", 1000, null, "one").lastInsertRowid;

    const { default: addTags } = await import("../src/lib/addTags");
    const { getPostsPage } = await import("../src/lib/listingQuery/getPosts");

    addTags(mediaId, [{ name: "cat" }]);

    const catId = db.prepare(`SELECT id FROM tags WHERE name = ?`).get("cat").id;
    db.prepare(`INSERT INTO tag_aliases (name, tag_id) VALUES (?, ?)`).run("felines", catId);

    // Blacklisting the alias must exclude the tag it points at.
    const blacklisted = await getPostsPage("", { defaultExcludedTags: ["felines"] });
    expect(blacklisted.posts).toEqual([]);

    // Searching the tag explicitly still wins over the blacklisted alias.
    const explicit = await getPostsPage("cat", { defaultExcludedTags: ["felines"] });
    expect(explicit.posts.map(post => post.id)).toEqual([mediaId]);
  });

  it("replaces tag links when replace=true", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, variants, checksum)
      VALUES (?, ?, ?, ?)
    `);

    const mediaId = insertMedia.run("2026/03/one.jpg", 3000, null, "one").lastInsertRowid;

    const { default: addTags } = await import("../src/lib/addTags");
    const { default: getPosts } = await import("../src/lib/listingQuery/getPosts");

    addTags(mediaId, [{ name: "cat" }, { name: "old" }]);
    addTags(mediaId, [{ name: "new" }], { replace: true });

    expect(await getPosts("cat")).toHaveLength(0);
    const posts = await getPosts("new");
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
    const res = await GET(new Request("http://localhost/api/tags/suggest?q=ca"));
    const body = await res.json();

    const dbTags = body.tags.filter(t => t.type !== "operator" && t.type !== "value");
    expect(dbTags).toEqual([
      { id: dbTags[0].id, name: "cat", type: "general", postCount: 2 },
      { id: dbTags[1].id, name: "car", type: "general", postCount: 2 },
    ]);
  });

  it("loads mime_type and has values for operator suggestions from DB", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, variants, checksum, mime_type)
      VALUES (?, ?, ?, ?, ?)
    `);

    const nowMs = Date.now();
    const mediaId = insertMedia.run(
      "2026/03/mime.jpg",
      nowMs,
      null,
      "mime",
      "image/jpeg"
    ).lastInsertRowid;

    const { default: addTags } = await import("../src/lib/addTags");
    addTags(mediaId, [{ name: "artist_name", type: "creator" }]);

    const { GET } = await import("../src/app/api/tags/suggest/route");

    const mimeRes = await GET(new Request("http://localhost/api/tags/suggest?q=mime_type:image/"));
    const mimeBody = await mimeRes.json();
    expect(mimeBody.tags.some(t => t.name === "mime_type:image/jpeg")).toBe(true);

    const hasRes = await GET(new Request("http://localhost/api/tags/suggest?q=has:c"));
    const hasBody = await hasRes.json();
    expect(hasBody.tags.some(t => t.name === "has:creator")).toBe(true);
  });

  it("supports age filters when created_at is stored as unix milliseconds", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, variants, checksum)
      VALUES (?, ?, ?, ?)
    `);

    const nowMs = Date.now();
    const recent = insertMedia.run("2026/03/recent.jpg", nowMs, null, "recent").lastInsertRowid;
    insertMedia.run("2026/03/old.jpg", nowMs - (2 * 24 * 60 * 60 * 1000), null, "old");

    const { default: getPosts } = await import("../src/lib/listingQuery/getPosts");

    const recentPosts = await getPosts("age:<1h");
    expect(recentPosts).toHaveLength(1);
    expect(recentPosts[0].id).toBe(recent);

    const oldEnoughPosts = await getPosts("age:>=1d");
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
    const { default: getPosts } = await import("../src/lib/listingQuery/getPosts");

    addTags(p1, [{ name: "a" }, { name: "b" }, { name: "c" }]);
    addTags(p2, [{ name: "a" }, { name: "b" }]);
    addTags(p3, [{ name: "a" }]);

    expect((await getPosts("mpixels:>=2")).map(p => p.checksum).sort()).toEqual(["p1", "p2"]);
    expect((await getPosts("duration:<1m")).map(p => p.checksum).sort()).toEqual(["p2", "p3"]);
    expect((await getPosts("image_ratio:>=16/9")).map(p => p.checksum).sort()).toEqual(["p1", "p2"]);

    expect((await getPosts("order:pixelcount limit:3")).map(p => p.checksum)).toEqual(["p1", "p2", "p3"]);
    expect((await getPosts("order:image_ratio limit:3")).map(p => p.checksum)).toEqual(["p1", "p2", "p3"]);
    expect((await getPosts("order:tag_count limit:3")).map(p => p.checksum)).toEqual(["p1", "p2", "p3"]);
    expect((await getPosts("order:pixelcount_asc limit:3")).map(p => p.checksum)).toEqual(["p3", "p2", "p1"]);
    expect((await getPosts("order:duration_asc limit:3")).map(p => p.checksum)).toEqual(["p3", "p2", "p1"]);
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

    const { default: getPosts } = await import("../src/lib/listingQuery/getPosts");

    const fox = await getPosts("notes:fox");
    expect(fox).toHaveLength(1);
    expect(fox[0].id).toBe(m1);

    const phrase = await getPosts("notes:\"quick brown\"");
    expect(phrase).toHaveLength(1);
    expect(phrase[0].id).toBe(m1);
  });

  it("filters posts by has operator for notes and tag types", async () => {
    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, notes_md, variants, checksum)
      VALUES (?, ?, ?, ?, ?)
    `);

    const nowMs = Date.now();
    const m1 = insertMedia.run(
      "2026/03/h1.jpg",
      nowMs,
      "contains notes",
      null,
      "h1"
    ).lastInsertRowid;
    const m2 = insertMedia.run(
      "2026/03/h2.jpg",
      nowMs,
      null,
      null,
      "h2"
    ).lastInsertRowid;
    const m3 = insertMedia.run(
      "2026/03/h3.jpg",
      nowMs,
      "   ",
      null,
      "h3"
    ).lastInsertRowid;

    const { default: addTags } = await import("../src/lib/addTags");
    const { default: getPosts } = await import("../src/lib/listingQuery/getPosts");

    addTags(m1, [{ name: "hero", type: "character" }]);
    addTags(m2, [{ name: "cat", type: "general" }]);

    expect((await getPosts("has:notes")).map(p => p.id)).toEqual([m1]);
    expect((await getPosts("-has:notes")).map(p => p.id).sort((a, b) => a - b)).toEqual([m2, m3]);
    expect((await getPosts("has:character")).map(p => p.id)).toEqual([m1]);
    expect((await getPosts("-has:character")).map(p => p.id).sort((a, b) => a - b)).toEqual([m2, m3]);
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
