import { beforeEach, describe, expect, it, vi } from "vitest";

function createDbMock({ tagRows = [], mimeRows = [], hasRows = [] } = {}) {
  const tagAll = vi.fn(() => tagRows);
  const mimeAll = vi.fn(() => mimeRows);
  const hasAll = vi.fn(() => hasRows);

  const prepare = vi.fn(sql => {
    if (sql.includes("FROM media m") && sql.includes("GROUP BY LOWER(TRIM(m.mime_type))"))
      return { all: mimeAll };

    if (sql.includes("FROM tags t") && sql.includes("GROUP BY LOWER(TRIM(t.type))"))
      return { all: hasAll };

    if (sql.includes("FROM tags t") && sql.includes("WHERE t.name LIKE ? || '%'"))
      return { all: tagAll };

    return { all: vi.fn(() => []) };
  });

  return { db: { prepare }, tagAll, mimeAll, hasAll };
}

describe("tags suggest route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns empty list for empty query", async () => {
    const { db, tagAll } = createDbMock();
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q="));
    const body = await res.json();

    expect(body).toEqual({ tags: [] });
    expect(tagAll).not.toHaveBeenCalled();
  });

  it("returns operator suggestions for matching prefix", async () => {
    const { db, tagAll } = createDbMock();
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=mi"));
    const body = await res.json();

    expect(body.tags[0]).toMatchObject({
      name: "mime_type:",
      type: "operator",
    });
    expect(tagAll).toHaveBeenCalledWith("mi");
  });

  it("returns operator values after colon and skips DB lookup", async () => {
    const { db, tagAll, mimeAll } = createDbMock({
      tagRows: [{ id: 1, name: "db-tag", type: "general", post_count: 1 }],
      mimeRows: [{ value: "video/mp4" }, { value: "video/webm" }],
    });
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=mime_type:video/"));
    const body = await res.json();

    expect(body.tags.length).toBeGreaterThan(0);
    expect(body.tags.every(tag => tag.type === "value")).toBe(true);
    expect(body.tags.some(tag => tag.name === "mime_type:video/mp4")).toBe(true);
    expect(mimeAll).toHaveBeenCalledTimes(1);
    expect(tagAll).not.toHaveBeenCalled();
  });

  it("returns order values for extended sort options", async () => {
    const { db, tagAll } = createDbMock();
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=order:im"));
    const body = await res.json();

    expect(body.tags.some(tag => tag.name === "order:image_ratio")).toBe(true);
    expect(body.tags.some(tag => tag.name === "order:image_ratio_asc")).toBe(true);
    expect(tagAll).not.toHaveBeenCalled();
  });

  it("returns notes operator suggestions", async () => {
    const { db, tagAll } = createDbMock();
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=no"));
    const body = await res.json();

    expect(body.tags.some(tag => tag.name === "notes:")).toBe(true);
    expect(tagAll).toHaveBeenCalledWith("no");
  });

  it("returns has operator suggestions", async () => {
    const { db, tagAll } = createDbMock();
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=ha"));
    const body = await res.json();

    expect(body.tags.some(tag => tag.name === "has:")).toBe(true);
    expect(tagAll).toHaveBeenCalledWith("ha");
  });

  it("returns has values after colon and loads them from DB", async () => {
    const { db, tagAll, hasAll } = createDbMock({
      tagRows: [{ id: 1, name: "db-tag", type: "general", post_count: 1 }],
      hasRows: [{ value: "character" }, { value: "creator" }, { value: "notes" }],
    });
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=has:c"));
    const body = await res.json();

    expect(body.tags.length).toBeGreaterThan(0);
    expect(body.tags.every(tag => tag.type === "value")).toBe(true);
    expect(body.tags.some(tag => tag.name === "has:character")).toBe(true);
    expect(hasAll).toHaveBeenCalledTimes(1);
    expect(tagAll).not.toHaveBeenCalled();
  });

  it("suppresses operator suggestions in edit mode", async () => {
    const { db, tagAll } = createDbMock({
      tagRows: [{ id: 3, name: "misc", type: "general", post_count: 9 }],
    });
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=mi&is_edit=true"));
    const body = await res.json();

    expect(body.tags).toEqual([
      { id: 3, name: "misc", type: "general", postCount: 9 },
    ]);
    expect(tagAll).toHaveBeenCalledWith("mi");
  });
});
