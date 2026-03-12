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
                post_count: 0,
              });
            }
          },
        };

      if (sql.includes("SELECT id, type FROM tags"))
        return {
          get: name => tags.get(name),
        };

      if (sql.includes("SELECT tag_id"))
        return {
          all: mediaId =>
            Array.from(ensureMediaSet(mediaId)).map(tagId => ({ tag_id: tagId })),
        };

      if (sql.includes("SET post_count = post_count + 1"))
        return {
          run: tagId => {
            for (const tag of tags.values()) {
              if (tag.id === tagId) {
                tag.post_count += 1;
                return { changes: 1 };
              }
            }
            return { changes: 0 };
          },
        };

      if (sql.includes("SET post_count = CASE"))
        return {
          run: tagId => {
            for (const tag of tags.values()) {
              if (tag.id === tagId) {
                tag.post_count = Math.max(0, tag.post_count - 1);
                return { changes: 1 };
              }
            }
            return { changes: 0 };
          },
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

      if (sql.includes("DELETE FROM media_tags") && sql.includes("AND tag_id = ?"))
        return {
          run: (mediaId, tagId) => {
            const set = ensureMediaSet(mediaId);
            const hadTag = set.has(tagId);
            set.delete(tagId);
            return { changes: hadTag ? 1 : 0 };
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
            const before = ensureMediaSet(mediaId).size;
            ensureMediaSet(mediaId).add(tagId);
            calls.linkMediaTag.push({ mediaId, tagId });
            const after = ensureMediaSet(mediaId).size;
            return { changes: after > before ? 1 : 0 };
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
    fake.tags.set("cat", { id: 9, type: "general", post_count: 0 });

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

  it("removeTags unlinks matching tags and decrements post counts", async () => {
    const fake = createFakeDb();
    fake.tags.set("cat", { id: 7, type: "general", post_count: 2 });
    fake.tags.set("dog", { id: 8, type: "general", post_count: 3 });
    fake.mediaTags.set(55, new Set([7, 8]));

    vi.doMock("@/lib/db", () => ({ default: fake.db }));
    const { removeTags } = await import("../src/lib/addTags");

    removeTags(55, [{ name: "cat" }, { name: "missing" }]);

    expect(fake.mediaTags.get(55).has(7)).toBe(false);
    expect(fake.mediaTags.get(55).has(8)).toBe(true);
    expect(fake.tags.get("cat").post_count).toBe(1);
    expect(fake.tags.get("dog").post_count).toBe(3);
  });
});
