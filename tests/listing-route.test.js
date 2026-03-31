import { beforeEach, describe, expect, it, vi } from "vitest";

describe("listing route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 400 when offset is invalid", async () => {
    const getPostsPage = vi.fn(() => ({ posts: [], hasMore: false, nextOffset: 0 }));
    const getBlacklistedTags = vi.fn(() => ["nsfw"]);
    const getTagTypeOrderSql = vi.fn(() => "CASE WHEN 'general' THEN 0 ELSE 1 END");

    vi.doMock("@/app/listing/lib/getPosts", () => ({ getPostsPage }));
    vi.doMock("@/lib/userSettings", () => ({ getBlacklistedTags, getTagTypeOrderSql }));

    const { GET } = await import("../src/app/api/listing/route");
    const res = await GET(new Request("http://localhost/api/listing?offset=-1"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Bad request" });
    expect(getPostsPage).not.toHaveBeenCalled();
  });

  it("returns 400 when limit is out of bounds", async () => {
    const getPostsPage = vi.fn(() => ({ posts: [], hasMore: false, nextOffset: 0 }));
    const getBlacklistedTags = vi.fn(() => []);
    const getTagTypeOrderSql = vi.fn(() => "CASE WHEN 'general' THEN 0 ELSE 1 END");

    vi.doMock("@/app/listing/lib/getPosts", () => ({ getPostsPage }));
    vi.doMock("@/lib/userSettings", () => ({ getBlacklistedTags, getTagTypeOrderSql }));

    const { GET } = await import("../src/app/api/listing/route");
    const res = await GET(new Request("http://localhost/api/listing?limit=999"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Bad request" });
    expect(getPostsPage).not.toHaveBeenCalled();
  });

  it("passes parsed params and blacklist defaults to getPostsPage", async () => {
    const result = {
      posts: [{ id: 1 }],
      hasMore: true,
      nextOffset: 51,
    };
    const getPostsPage = vi.fn(() => result);
    const getBlacklistedTags = vi.fn(() => ["nsfw", "spoiler"]);
    const getTagTypeOrderSql = vi.fn(() => "CASE WHEN 'meta' THEN 0 ELSE 1 END");

    vi.doMock("@/app/listing/lib/getPosts", () => ({ getPostsPage }));
    vi.doMock("@/lib/userSettings", () => ({ getBlacklistedTags, getTagTypeOrderSql }));

    const { GET } = await import("../src/app/api/listing/route");
    const res = await GET(new Request("http://localhost/api/listing?search=cat&offset=50&limit=25"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getBlacklistedTags).toHaveBeenCalled();
    expect(getPostsPage).toHaveBeenCalledWith("cat", {
      offset: 50,
      limit: 25,
      defaultExcludedTags: ["nsfw", "spoiler"],
      tagOrderSql: "CASE WHEN 'meta' THEN 0 ELSE 1 END",
    });
    expect(body).toEqual(result);
  });

  it("uses fallback offset when omitted", async () => {
    const result = { posts: [], hasMore: false, nextOffset: 0 };
    const getPostsPage = vi.fn(() => result);
    const getBlacklistedTags = vi.fn(() => []);
    const getTagTypeOrderSql = vi.fn(() => "CASE WHEN 'general' THEN 0 ELSE 1 END");

    vi.doMock("@/app/listing/lib/getPosts", () => ({ getPostsPage }));
    vi.doMock("@/lib/userSettings", () => ({ getBlacklistedTags, getTagTypeOrderSql }));

    const { GET } = await import("../src/app/api/listing/route");
    const res = await GET(new Request("http://localhost/api/listing"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getPostsPage).toHaveBeenCalledWith("", {
      offset: 0,
      limit: undefined,
      defaultExcludedTags: [],
      tagOrderSql: "CASE WHEN 'general' THEN 0 ELSE 1 END",
    });
    expect(body).toEqual(result);
  });
});
