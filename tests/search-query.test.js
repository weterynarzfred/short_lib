import { beforeEach, describe, expect, it, vi } from "vitest";

import buildQuery from "../src/lib/listingQuery/buildQuery";
import parseSearch from "../src/lib/listingQuery/parseSearch";

function simplifyTagExpression(node) {
  if (!node) return null;

  if (node.type === "TAG")
    return node.negated ? { type: "TAG", name: node.name, negated: true } : node.name;

  return [node.type, simplifyTagExpression(node.left), simplifyTagExpression(node.right)];
}

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

  it("applies default excluded tags unless query already mentions them", () => {
    const parsed = parseSearch("cat -bird", {
      defaultExcludedTags: ["nsfw", "cat", "bird", "nsfw"],
    });

    expect(parsed.includeTags).toEqual(["cat"]);
    expect(parsed.excludeTags).toEqual(["bird", "nsfw"]);
  });

  it("allows explicit include tags to override blacklist defaults", () => {
    const parsed = parseSearch("nsfw", {
      defaultExcludedTags: ["nsfw", "spoiler"],
    });

    expect(parsed.includeTags).toEqual(["nsfw"]);
    expect(parsed.excludeTags).toEqual(["spoiler"]);
  });

  it("keeps default limit when limit token is malformed", () => {
    expect(parseSearch("limit:abc").filters.limit).toBe(100);
    expect(parseSearch("limit:").filters.limit).toBe(100);
  });

  it("builds SQL with boolean tag predicates", () => {
    const { sql, params } = buildQuery(parseSearch("cat dog -bird -fish limit:25"));

    expect(params).toEqual(["cat", "dog", "bird", "fish"]);
    expect(sql).toContain("EXISTS (");
    expect(sql).toMatch(/NOT\s+EXISTS/);
    expect(sql).toContain("LIMIT 25");
    expect(sql).toContain("OFFSET 0");
  });

  it("supports OR with parentheses and implicit AND", () => {
    const parsed = parseSearch("(raven OR owl) plague_doctor");
    const { sql, params } = buildQuery(parsed);

    expect(simplifyTagExpression(parsed.tagExpression)).toEqual([
      "AND",
      ["OR", "raven", "owl"],
      "plague_doctor",
    ]);
    expect(sql).toContain(" OR ");
    expect(sql).toContain(" AND ");
    expect(params).toEqual(["raven", "owl", "plague_doctor"]);
  });

  it("keeps AND precedence higher than OR without parentheses", () => {
    const parsed = parseSearch("raven OR owl plague_doctor");

    expect(simplifyTagExpression(parsed.tagExpression)).toEqual([
      "OR",
      "raven",
      ["AND", "owl", "plague_doctor"],
    ]);
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

  it("parses notes operator into a notes query filter", () => {
    const parsed = parseSearch("notes:\"hello world\" notes:cat");
    expect(parsed.filters.notes).toBe("hello world cat");
  });

  it("adds notes id clause when notes matches are pre-resolved", () => {
    const parsed = parseSearch("notes:\"hello world\"");
    parsed.filters.notesMediaIds = [7, 9];
    const { sql, params } = buildQuery(parsed);

    expect(sql).toContain("m.id IN (?, ?)");
    expect(sql).not.toContain("media_notes_fts");
    expect(params).toEqual([7, 9]);
  });

  it("forces empty result when notes query has no resolved ids", () => {
    const parsed = parseSearch("notes:\"hello world\"");
    const { sql, params } = buildQuery(parsed);

    expect(sql).toContain("1 = 0");
    expect(params).toEqual([]);
  });

  it("parses has operators into normalized filters", () => {
    const parsed = parseSearch("has:notes -has:character has:creator");

    expect(parsed.filters.has).toEqual([
      { value: "notes", negated: false },
      { value: "character", negated: true },
      { value: "creator", negated: false },
    ]);
  });

  it("adds has predicates and tag-type params to SQL", () => {
    const parsed = parseSearch("has:notes -has:character has:creator");
    const { sql, params } = buildQuery(parsed);

    expect(sql).toContain("COALESCE(TRIM(m.notes_md), '') <> ''");
    expect(sql).toContain("NOT");
    expect(sql).toContain("LOWER(t.type) = ?");
    expect(params).toEqual(["character", "creator"]);
  });

  it("ignores malformed operator tokens", () => {
    const parsed = parseSearch("file_size:abc age:-- order:nope mpixels:x duration:- image_ratio:1/0 has: -has: tag1");

    expect(parsed.includeTags).toEqual(["tag1"]);
    expect(parsed.filters.fileSize).toBeNull();
    expect(parsed.filters.age).toBeNull();
    expect(parsed.filters.mpixels).toBeNull();
    expect(parsed.filters.duration).toBeNull();
    expect(parsed.filters.imageRatio).toBeNull();
    expect(parsed.filters.has).toEqual([]);
    expect(parsed.filters.orderBy).toBe("m.created_at DESC");
  });

  it("supports additional order modes", () => {
    expect(parseSearch("order:image_ratio").filters.orderBy).toContain("CAST(m.width AS REAL) / m.height");
    expect(parseSearch("order:tag_count").filters.orderBy).toBe("tag_count DESC");
    expect(parseSearch("order:file_size_asc").filters.orderBy).toBe("m.file_size ASC");
    expect(parseSearch("order:age_desc").filters.orderBy).toBe("m.created_at DESC");
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
    vi.doMock("@/lib/search", () => ({
      searchMediaIdsByNotes: vi.fn(async () => []),
    }));
    vi.doMock("@/lib/tagAliases", () => ({
      resolveTagName: vi.fn(name => name),
    }));

    const { default: getPosts } = await import("../src/lib/listingQuery/getPosts");
    const posts = await getPosts("tag1");

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
    vi.doMock("@/lib/search", () => ({
      searchMediaIdsByNotes: vi.fn(async () => []),
    }));
    vi.doMock("@/lib/tagAliases", () => ({
      resolveTagName: vi.fn(name => name),
    }));

    const { getPostsPage } = await import("../src/lib/listingQuery/getPosts");
    const page = await getPostsPage("", { limit: 2, offset: 0 });

    expect(page.posts.map(post => post.id)).toEqual([1, 2]);
    expect(page.hasMore).toBe(true);
    expect(page.nextOffset).toBe(2);
  });

  it("surfaces a failing listing query instead of returning an empty page", async () => {
    const db = {
      prepare: vi.fn(() => {
        throw new Error("no such column: m.bogus");
      }),
    };

    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({
      searchMediaIdsByNotes: vi.fn(async () => []),
    }));
    vi.doMock("@/lib/tagAliases", () => ({
      resolveTagName: vi.fn(name => name),
    }));

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => { });
    const { getPostsPage } = await import("../src/lib/listingQuery/getPosts");

    await expect(getPostsPage("cat")).rejects.toThrow("no such column: m.bogus");
    expect(consoleError).toHaveBeenCalledOnce();

    consoleError.mockRestore();
  });
});
