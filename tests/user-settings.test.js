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

      if (sql.includes("SELECT DISTINCT LOWER(TRIM(type)) AS type")) {
        return {
          all: () => [...store.entries()]
            .filter(([key]) => key.startsWith("__tag_type__:"))
            .map(([, value]) => ({ type: value })),
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }),
    transaction: vi.fn(fn => rows => fn(rows)),
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

describe("userSettings tag type order", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns default order plus DB-only types when not configured", async () => {
    const { db } = mockDb({
      "__tag_type__:1": "meta",
      "__tag_type__:2": "special",
    });
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { getTagTypeOrder } = await import("../src/lib/userSettings");
    expect(getTagTypeOrder()).toEqual([
      "meta",
      "rating",
      "creator",
      "copyright",
      "character",
      "general",
      "special",
    ]);
  });

  it("stores and reads normalized tag type order", async () => {
    const { db, store } = mockDb({
      "__tag_type__:1": "meta",
      "__tag_type__:2": "custom",
    });
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { TAG_TYPE_ORDER_KEY, setTagTypeOrder } = await import("../src/lib/userSettings");
    const tagTypeOrder = setTagTypeOrder("META creator meta");

    expect(store.get(TAG_TYPE_ORDER_KEY)).toBe("[\"meta\",\"creator\"]");
    expect(tagTypeOrder).toEqual(["meta", "creator", "custom"]);
  });

  it("builds SQL CASE from configured order", async () => {
    const { db } = mockDb({
      "listing.tag_type_order": "[\"creator\",\"meta\"]",
      "__tag_type__:1": "meta",
      "__tag_type__:2": "creator",
      "__tag_type__:3": "general",
    });
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { getTagTypeOrderSql } = await import("../src/lib/userSettings");
    const sql = getTagTypeOrderSql();

    expect(sql).toContain("WHEN 'creator' THEN 0");
    expect(sql).toContain("WHEN 'meta' THEN 1");
    expect(sql).toContain("WHEN 'general' THEN 2");
  });
});

describe("userSettings tag type colors", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("reads normalized colors only for tag types present in DB", async () => {
    const { db } = mockDb({
      "__tag_type__:1": "meta",
      "__tag_type__:2": "creator",
      "listing.tag_type_colors": "{\"meta\":\"#abc\",\"creator\":\"#00ff00\",\"stale\":\"#123456\"}",
    });
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { getTagTypeColors } = await import("../src/lib/userSettings");
    expect(getTagTypeColors()).toEqual({
      meta: "#abc",
      creator: "#00ff00",
    });
  });

  it("stores color settings as JSON and drops non-existing tag types", async () => {
    const { db, store } = mockDb({
      "__tag_type__:1": "meta",
      "__tag_type__:2": "special",
    });
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { TAG_TYPE_COLORS_KEY, setTagTypeColors } = await import("../src/lib/userSettings");
    const colors = setTagTypeColors({
      meta: "#123abc",
      stale: "#FFFFFF",
    });

    expect(colors).toEqual({
      meta: "#123abc",
      special: "#EEEEEE",
    });
    expect(store.get(TAG_TYPE_COLORS_KEY)).toBe("{\"meta\":\"#123abc\",\"special\":\"#EEEEEE\"}");
  });

  it("builds global css class rules from stored tag type colors", async () => {
    const { db } = mockDb({
      "__tag_type__:1": "meta",
      "__tag_type__:2": "creator",
      "__tag_type__:3": "artist.name",
      "listing.tag_type_colors": "{\"meta\":\"#FF0000\",\"creator\":\"#00FF00\",\"artist.name\":\"#123456\"}",
    });
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { getTagTypeColorsCss } = await import("../src/lib/userSettings");
    const css = getTagTypeColorsCss();

    expect(css).toContain(".tag-type-meta { color: #FF0000; }");
    expect(css).toContain(".tag-type-creator { color: #00FF00; }");
    expect(css).toContain(".tag-type-artist_name { color: #123456; }");
  });
});

describe("userSettings media", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns default media settings when nothing is stored", async () => {
    const { db } = mockDb();
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { getMediaSettings, MEDIA_SETTINGS_DEFAULTS } = await import("../src/lib/userSettings");
    expect(getMediaSettings()).toEqual(MEDIA_SETTINGS_DEFAULTS);
  });

  it("stores only known media settings keys", async () => {
    const { db, store } = mockDb();
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { setMediaSettings } = await import("../src/lib/userSettings");
    const media = setMediaSettings({
      autoplay: true,
      loop: true,
      somethingElse: true,
    });

    expect(media.autoplay).toBe(true);
    expect(media.loop).toBe(true);
    expect(store.get("media.autoplay")).toBe("1");
    expect(store.get("media.loop")).toBe("1");
    expect(store.has("media.somethingElse")).toBe(false);
  });
});
