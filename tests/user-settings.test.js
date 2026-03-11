import { beforeEach, describe, expect, it, vi } from "vitest";

function mockDb(initial = {}) {
  const store = new Map(Object.entries(initial));

  const db = {
    prepare: vi.fn(sql => {
      if (sql.includes("WHERE key LIKE 'media.%'")) {
        return {
          all: () => [...store.entries()]
            .filter(([key]) => key.startsWith("media."))
            .map(([key, value]) => ({ key, value })),
        };
      }

      if (sql.includes("WHERE key = ?")) {
        return {
          get: key => store.has(key) ? { value: store.get(key) } : undefined,
        };
      }

      if (sql.includes("INSERT INTO user_settings")) {
        return {
          run: (key, value) => {
            store.set(key, value);
          },
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };

  return { db, store };
}

describe("userSettings blacklist", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("stores normalized blacklisted tags as JSON", async () => {
    const { db, store } = mockDb();
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { BLACKLISTED_TAGS_KEY, setBlacklistedTags } = await import("../src/lib/userSettings");
    const tags = setBlacklistedTags("meta:nsfw spoiler meta:nsfw");

    expect(tags).toEqual(["nsfw", "spoiler"]);
    expect(store.get(BLACKLISTED_TAGS_KEY)).toBe("[\"nsfw\",\"spoiler\"]");
  });

  it("reads blacklist tags from JSON values", async () => {
    const { db } = mockDb({
      "listing.blacklisted_tags": "[\"nsfw\",\"spoiler\",\"nsfw\"]",
    });
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { getBlacklistedTags } = await import("../src/lib/userSettings");
    expect(getBlacklistedTags()).toEqual(["nsfw", "spoiler"]);
  });

  it("supports legacy plain-string storage format", async () => {
    const { db } = mockDb({
      "listing.blacklisted_tags": "meta:nsfw spoiler",
    });
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { getBlacklistedTags } = await import("../src/lib/userSettings");
    expect(getBlacklistedTags()).toEqual(["nsfw", "spoiler"]);
  });
});
