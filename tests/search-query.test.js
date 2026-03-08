import { beforeEach, describe, expect, it, vi } from "vitest";

import buildQuery from "../src/app/listing/lib/buildQuery";
import parseSearch from "../src/app/listing/lib/parseSearch";

describe("search parser and query builder", () => {
  it("ignores extra whitespace and keeps include/exclude tags", () => {
    const parsed = parseSearch("   tag1   -tag2   tag3  ");

    expect(parsed.includeTags).toEqual(["tag1", "tag3"]);
    expect(parsed.excludeTags).toEqual(["tag2"]);
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
  });

  it("parses operator filters and applies them to SQL", () => {
    const parsed = parseSearch("mime_type:video/mp4 file_size:>10mb age:<7d order:file_size");
    const { sql, params } = buildQuery(parsed);

    expect(parsed.filters.orderBy).toBe("m.file_size DESC");
    expect(parsed.filters.mimeTypes).toEqual(["video/mp4"]);
    expect(parsed.filters.fileSize).toEqual({ op: ">", value: 10485760 });
    expect(parsed.filters.age).toEqual({ op: "<", value: 604800 });

    expect(sql).toContain("LOWER(m.mime_type) IN (?)");
    expect(sql).toContain("m.file_size > ?");
    expect(sql).toContain("ORDER BY m.file_size DESC");
    expect(params).toEqual(["video/mp4", 10485760, 604800]);
  });

  it("ignores malformed operator tokens", () => {
    const parsed = parseSearch("file_size:abc age:-- order:nope tag1");

    expect(parsed.includeTags).toEqual(["tag1"]);
    expect(parsed.filters.fileSize).toBeNull();
    expect(parsed.filters.age).toBeNull();
    expect(parsed.filters.orderBy).toBe("m.created_at DESC");
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
});
