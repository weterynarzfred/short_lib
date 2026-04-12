import { beforeEach, describe, expect, it, vi } from "vitest";

function createDbMock({ mimeRows = [], hasRows = [] } = {}) {
  const mimeAll = vi.fn(() => mimeRows);
  const hasAll = vi.fn(() => hasRows);

  const prepare = vi.fn(sql => {
    if (sql.includes("FROM media m") && sql.includes("GROUP BY LOWER(TRIM(m.mime_type))"))
      return { all: mimeAll };

    if (sql.includes("FROM tags t") && sql.includes("GROUP BY LOWER(TRIM(t.type))"))
      return { all: hasAll };

    return { all: vi.fn(() => []) };
  });

  return { db: { prepare }, mimeAll, hasAll };
}

describe("tags suggest route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns empty list for empty query", async () => {
    const { db } = createDbMock();
    const searchTagSuggestions = vi.fn(async () => []);
    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({ searchTagSuggestions }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = await GET(new Request("http://localhost/api/tags/suggest?q="));
    const body = await res.json();

    expect(body).toEqual({ tags: [] });
    expect(searchTagSuggestions).not.toHaveBeenCalled();
  });

  it("returns operator suggestions and search tag suggestions", async () => {
    const { db } = createDbMock();
    const searchTagSuggestions = vi.fn(async () => [
      { id: 2, name: "mime", type: "general", postCount: 7 },
    ]);
    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({ searchTagSuggestions }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = await GET(new Request("http://localhost/api/tags/suggest?q=mi"));
    const body = await res.json();

    expect(body.tags[0]).toMatchObject({
      name: "mime_type:",
      type: "operator",
    });
    expect(body.tags.some(tag => tag.name === "mime")).toBe(true);
    expect(searchTagSuggestions).toHaveBeenCalledWith("mi", { limit: 16 });
  });

  it("returns operator values after colon and skips tag lookup", async () => {
    const { db, mimeAll } = createDbMock({
      mimeRows: [{ value: "video/mp4" }, { value: "video/webm" }],
    });
    const searchTagSuggestions = vi.fn(async () => []);
    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({ searchTagSuggestions }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = await GET(new Request("http://localhost/api/tags/suggest?q=mime_type:video/"));
    const body = await res.json();

    expect(body.tags.length).toBeGreaterThan(0);
    expect(body.tags.every(tag => tag.type === "value")).toBe(true);
    expect(body.tags.some(tag => tag.name === "mime_type:video/mp4")).toBe(true);
    expect(mimeAll).toHaveBeenCalledTimes(1);
    expect(searchTagSuggestions).not.toHaveBeenCalled();
  });

  it("returns order values for extended sort options", async () => {
    const { db } = createDbMock();
    const searchTagSuggestions = vi.fn(async () => []);
    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({ searchTagSuggestions }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = await GET(new Request("http://localhost/api/tags/suggest?q=order:im"));
    const body = await res.json();

    expect(body.tags.some(tag => tag.name === "order:image_ratio")).toBe(true);
    expect(body.tags.some(tag => tag.name === "order:image_ratio_asc")).toBe(true);
    expect(searchTagSuggestions).not.toHaveBeenCalled();
  });

  it("returns notes operator suggestions", async () => {
    const { db } = createDbMock();
    const searchTagSuggestions = vi.fn(async () => []);
    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({ searchTagSuggestions }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = await GET(new Request("http://localhost/api/tags/suggest?q=no"));
    const body = await res.json();

    expect(body.tags.some(tag => tag.name === "notes:")).toBe(true);
    expect(searchTagSuggestions).toHaveBeenCalledWith("no", { limit: 16 });
  });

  it("returns has values after colon and loads them from DB", async () => {
    const { db, hasAll } = createDbMock({
      hasRows: [{ value: "character" }, { value: "creator" }, { value: "notes" }],
    });
    const searchTagSuggestions = vi.fn(async () => []);
    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({ searchTagSuggestions }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = await GET(new Request("http://localhost/api/tags/suggest?q=has:c"));
    const body = await res.json();

    expect(body.tags.length).toBeGreaterThan(0);
    expect(body.tags.every(tag => tag.type === "value")).toBe(true);
    expect(body.tags.some(tag => tag.name === "has:character")).toBe(true);
    expect(hasAll).toHaveBeenCalledTimes(1);
    expect(searchTagSuggestions).not.toHaveBeenCalled();
  });

  it("suppresses operator suggestions in edit mode", async () => {
    const { db } = createDbMock();
    const searchTagSuggestions = vi.fn(async () => [
      { id: 3, name: "misc", type: "general", postCount: 9 },
    ]);
    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({ searchTagSuggestions }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = await GET(new Request("http://localhost/api/tags/suggest?q=mi&is_edit=true"));
    const body = await res.json();

    expect(body.tags).toEqual([
      { id: 3, name: "misc", type: "general", postCount: 9 },
    ]);
    expect(searchTagSuggestions).toHaveBeenCalledWith("mi", { limit: 16 });
  });
});
