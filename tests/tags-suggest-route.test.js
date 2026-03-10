import { beforeEach, describe, expect, it, vi } from "vitest";

describe("tags suggest route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns empty list for empty query", async () => {
    const all = vi.fn(() => []);
    const db = { prepare: vi.fn(() => ({ all })) };
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q="));
    const body = await res.json();

    expect(body).toEqual({ tags: [] });
    expect(all).not.toHaveBeenCalled();
  });

  it("returns operator suggestions for matching prefix", async () => {
    const all = vi.fn(() => []);
    const db = { prepare: vi.fn(() => ({ all })) };
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=mi"));
    const body = await res.json();

    expect(body.tags[0]).toMatchObject({
      name: "mime_type:",
      type: "operator",
    });
    expect(all).toHaveBeenCalledWith("mi");
  });

  it("returns operator values after colon and skips DB lookup", async () => {
    const all = vi.fn(() => [{ id: 1, name: "db-tag", type: "general", post_count: 1 }]);
    const db = { prepare: vi.fn(() => ({ all })) };
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=mime_type:video/"));
    const body = await res.json();

    expect(body.tags.length).toBeGreaterThan(0);
    expect(body.tags.every(tag => tag.type === "value")).toBe(true);
    expect(all).not.toHaveBeenCalled();
  });

  it("returns order values for extended sort options", async () => {
    const all = vi.fn(() => []);
    const db = { prepare: vi.fn(() => ({ all })) };
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=order:im"));
    const body = await res.json();

    expect(body.tags.some(tag => tag.name === "order:image_ratio")).toBe(true);
    expect(all).not.toHaveBeenCalled();
  });

  it("returns notes operator suggestions", async () => {
    const all = vi.fn(() => []);
    const db = { prepare: vi.fn(() => ({ all })) };
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=no"));
    const body = await res.json();

    expect(body.tags.some(tag => tag.name === "notes:")).toBe(true);
    expect(all).toHaveBeenCalledWith("no");
  });

  it("suppresses operator suggestions in edit mode", async () => {
    const all = vi.fn(() => [{ id: 3, name: "misc", type: "general", post_count: 9 }]);
    const db = { prepare: vi.fn(() => ({ all })) };
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { GET } = await import("../src/app/api/tags/suggest/route");
    const res = GET(new Request("http://localhost/api/tags/suggest?q=mi&is_edit=true"));
    const body = await res.json();

    expect(body.tags).toEqual([
      { id: 3, name: "misc", type: "general", postCount: 9 },
    ]);
  });
});
