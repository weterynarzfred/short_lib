import { beforeEach, describe, expect, it, vi } from "vitest";

import buildQuery from "../src/app/listing/lib/buildQuery";
import parseSearch from "../src/app/listing/lib/parseSearch";

describe("search parser and query builder", () => {
  it("ignores extra whitespace and keeps include/exclude tags", () => {
    const parsed = parseSearch("   tag1   -tag2   tag3  ");

    expect(parsed.includeTags).toEqual(["tag1", "tag3"]);
    expect(parsed.excludeTags).toEqual(["tag2"]);
  });

  it("supports quoted tokens with spaces", () => {
    const parsed = parseSearch("tag1 \"tag two\" -\"tag three\"");

    expect(parsed.includeTags).toEqual(["tag1", "tag two"]);
    expect(parsed.excludeTags).toEqual(["tag three"]);
  });

  it("supports escaped quotes inside quoted tokens", () => {
    const parsed = parseSearch("\"say \\\"hello\\\"\" -\"quote: \\\"x\\\"\"");

    expect(parsed.includeTags).toEqual(["say \"hello\""]);
    expect(parsed.excludeTags).toEqual(["quote: \"x\""]);
  });

  it("keeps default limit when limit token is malformed", () => {
    expect(parseSearch("limit:abc").filters.limit).toBe(100);
    expect(parseSearch("limit:").filters.limit).toBe(100);
  });

  it("builds SQL with include joins and exclude NOT EXISTS clauses", () => {
    const { sql, params } = buildQuery(parseSearch("cat dog -bird -fish limit:25"));

    expect(params).toEqual(["cat", "dog", "bird", "fish"]);
    expect(sql).toContain("JOIN media_tags mt1");
    expect(sql).toContain("JOIN media_tags mt2");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("LIMIT 25");
    expect(sql).toContain("OFFSET 0");
  });

  it("supports explicit limit/offset pagination overrides", () => {
    const { sql } = buildQuery(parseSearch("cat limit:25"), { limit: 10, offset: 40 });

    expect(sql).toContain("LIMIT 10");
    expect(sql).toContain("OFFSET 40");
  });

  it("parses operator filters and applies them to SQL", () => {
    const parsed = parseSearch(
      "mime_type:video/mp4 file_size:>10mb age:<7d mpixels:>=2 duration:<90s image_ratio:16/9 order:pixelcount"
    );
    const { sql, params } = buildQuery(parsed);

    expect(parsed.filters.orderBy).toContain("COALESCE(m.width, 0) * COALESCE(m.height, 0)");
    expect(parsed.filters.mimeTypes).toEqual(["video/mp4"]);
    expect(parsed.filters.fileSize).toEqual({ op: ">", value: 10485760 });
    expect(parsed.filters.age).toEqual({ op: "<", value: 604800 });
    expect(parsed.filters.mpixels).toEqual({ op: ">=", value: 2000000 });
    expect(parsed.filters.duration).toEqual({ op: "<", value: 90000 });
    expect(parsed.filters.imageRatio).toEqual({ op: "=", value: 16 / 9 });

    expect(sql).toContain("LOWER(m.mime_type) IN (?)");
    expect(sql).toContain("m.file_size > ?");
    expect(sql).toContain("m.duration_ms < ?");
    expect(sql).toContain("CAST(m.width AS REAL) / m.height");
    expect(sql).toContain("ORDER BY (COALESCE(m.width, 0) * COALESCE(m.height, 0)) DESC");
    expect(params).toEqual(["video/mp4", 10485760, 604800, 2000000, 90000, 16 / 9]);
  });

  it("parses notes operator into an FTS query filter", () => {
    const parsed = parseSearch("notes:\"hello world\" notes:cat");
    expect(parsed.filters.notes).toBe("hello world cat");
  });

  it("adds FTS notes clause and parameter to SQL", () => {
    const parsed = parseSearch("notes:\"hello world\"");
    const { sql, params } = buildQuery(parsed);

    expect(sql).toContain("FROM media_notes_fts");
    expect(sql).toContain("media_notes_fts MATCH ?");
    expect(params).toEqual(["hello world"]);
  });

  it("ignores malformed operator tokens", () => {
    const parsed = parseSearch("file_size:abc age:-- order:nope mpixels:x duration:- image_ratio:1/0 tag1");

    expect(parsed.includeTags).toEqual(["tag1"]);
    expect(parsed.filters.fileSize).toBeNull();
    expect(parsed.filters.age).toBeNull();
    expect(parsed.filters.mpixels).toBeNull();
    expect(parsed.filters.duration).toBeNull();
    expect(parsed.filters.imageRatio).toBeNull();
    expect(parsed.filters.orderBy).toBe("m.created_at DESC");
  });

  it("supports additional order modes", () => {
    expect(parseSearch("order:image_ratio").filters.orderBy).toContain("CAST(m.width AS REAL) / m.height");
    expect(parseSearch("order:tag_count").filters.orderBy).toBe("tag_count DESC");
  });
});

describe("getPosts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("parses JSON fields with safe fallbacks", async () => {
    const fakeRows = [
      {
        id: 1,
        variants: null,
        tags: '[{"id":1,"name":"tag1"}]',
      },
      {
        id: 2,
        variants: "{bad json",
        tags: null,
      },
    ];

    const db = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => fakeRows),
      })),
    };

    vi.doMock("@/lib/db", () => ({ default: db }));

    const { default: getPosts } = await import("../src/app/listing/lib/getPosts");
    const posts = getPosts("tag1");

    expect(posts[0].variants).toBeNull();
    expect(posts[0].tags).toEqual([{ id: 1, name: "tag1" }]);
    expect(posts[1].variants).toBeNull();
    expect(posts[1].tags).toEqual([]);
  });

  it("returns paginated rows with hasMore metadata", async () => {
    const fakeRows = [
      { id: 1, variants: null, tags: "[]" },
      { id: 2, variants: null, tags: "[]" },
      { id: 3, variants: null, tags: "[]" },
    ];

    const db = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => fakeRows),
      })),
    };

    vi.doMock("@/lib/db", () => ({ default: db }));

    const { getPostsPage } = await import("../src/app/listing/lib/getPosts");
    const page = getPostsPage("", { limit: 2, offset: 0 });

    expect(page.posts.map(post => post.id)).toEqual([1, 2]);
    expect(page.hasMore).toBe(true);
    expect(page.nextOffset).toBe(2);
  });
});
