import { beforeEach, describe, expect, it, vi } from "vitest";

function createFakeDb() {
  const tags = new Map();
  const mediaTags = new Map();
  const calls = {
    clearMediaTags: [],
    updateTagType: [],
    linkMediaTag: [],
  };
  let nextTagId = 1;

  function ensureMediaSet(mediaId) {
    if (!mediaTags.has(mediaId)) mediaTags.set(mediaId, new Set());
    return mediaTags.get(mediaId);
  }

  const db = {
    prepare: vi.fn(sql => {
      if (sql.includes("INSERT INTO tags"))
        return {
          run: (name, type) => {
            if (!tags.has(name)) {
              tags.set(name, {
                id: nextTagId++,
                type: type ?? "general",
              });
            }
          },
        };

      if (sql.includes("SELECT id, type FROM tags"))
        return {
          get: name => tags.get(name),
        };

      if (sql.includes("UPDATE tags"))
        return {
          run: (type, name) => {
            const current = tags.get(name);
            if (current) {
              current.type = type;
              calls.updateTagType.push({ name, type });
            }
          },
        };

      if (sql.includes("DELETE FROM media_tags"))
        return {
          run: mediaId => {
            mediaTags.set(mediaId, new Set());
            calls.clearMediaTags.push(mediaId);
          },
        };

      if (sql.includes("INSERT OR IGNORE INTO media_tags"))
        return {
          run: (mediaId, tagId) => {
            ensureMediaSet(mediaId).add(tagId);
            calls.linkMediaTag.push({ mediaId, tagId });
          },
        };

      throw new Error(`Unexpected SQL in test double: ${sql}`);
    }),
    transaction: vi.fn(fn => (...args) => fn(...args)),
  };

  return { db, tags, mediaTags, calls };
}

describe("addTags", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("parses typed and untyped tokens from a tag string", async () => {
    const fake = createFakeDb();
    vi.doMock("@/lib/db", () => ({ default: fake.db }));
    const { parseTagString } = await import("../src/lib/addTags");

    expect(parseTagString("meta:image  plain  series:one:two")).toEqual([
      { name: "image", type: "meta" },
      { name: "plain" },
      { name: "one:two", type: "series" },
    ]);
  });

  it("replaces existing media tags and updates type when needed", async () => {
    const fake = createFakeDb();
    fake.tags.set("cat", { id: 9, type: "general" });

    vi.doMock("@/lib/db", () => ({ default: fake.db }));
    const { default: addTags } = await import("../src/lib/addTags");

    addTags(123, [{ name: "cat", type: "meta" }, { name: "new-tag" }], { replace: true });

    expect(fake.calls.clearMediaTags).toEqual([123]);
    expect(fake.tags.get("cat").type).toBe("meta");
    expect(fake.calls.updateTagType).toEqual([{ name: "cat", type: "meta" }]);

    const linked = fake.mediaTags.get(123);
    expect(linked.has(9)).toBe(true);
    expect(linked.size).toBe(2);
  });

  it("clears links when replace=true and tag input is empty", async () => {
    const fake = createFakeDb();
    vi.doMock("@/lib/db", () => ({ default: fake.db }));
    const { default: addTags } = await import("../src/lib/addTags");

    addTags(77, [], { replace: true });

    expect(fake.calls.clearMediaTags).toEqual([77]);
  });
});
