import { describe, expect, it } from "vitest";

import getSubtitleKinds from "@/lib/listingQuery/subtitleKinds";
import parseSearch from "@/lib/listingQuery/parseSearch";
import getPostSubtitles from "@/app/listing/lib/postSubtitle";
import formatDate from "@/lib/formatDate";

const kindsFor = search => getSubtitleKinds(parseSearch(search));

describe("getSubtitleKinds", () => {
  it("returns nothing when no filter or explicit order is active", () => {
    expect(kindsFor("cat -dog")).toEqual([]);
    expect(kindsFor("")).toEqual([]);
    expect(getSubtitleKinds(null)).toEqual([]);
  });

  it("includes the kind a filter narrowed on", () => {
    expect(kindsFor("file_size:>1mb")).toEqual(["file_size"]);
    expect(kindsFor("age:<7d")).toEqual(["age"]);
  });

  it("includes the kind an explicit order sorted by", () => {
    expect(kindsFor("order:file_size")).toEqual(["file_size"]);
    expect(kindsFor("order:date")).toEqual(["age"]);
    expect(kindsFor("order:tag_count")).toEqual(["tag_count"]);
  });

  // Both already appear in every card's badge, so a subtitle line would just repeat them.
  it("has no subtitle for duration or pixel count", () => {
    expect(kindsFor("duration:<90s")).toEqual([]);
    expect(kindsFor("mpixels:>=2")).toEqual([]);
    expect(kindsFor("order:duration")).toEqual([]);
    expect(kindsFor("order:pixelcount")).toEqual([]);
    expect(kindsFor("duration:<90s mpixels:>=2 file_size:>1mb")).toEqual(["file_size"]);
  });

  it("treats ascending order the same as descending", () => {
    expect(kindsFor("order:file_size_asc")).toEqual(["file_size"]);
    expect(kindsFor("order:tag_count_asc")).toEqual(["tag_count"]);
  });

  // The whole reason parseSearch records orderKey separately.
  it("does not treat the default ordering as an explicit order", () => {
    expect(kindsFor("cat")).toEqual([]);
    expect(parseSearch("cat").filters.orderKey).toBeNull();
    expect(parseSearch("order:date").filters.orderKey).toBe("date");
  });

  it("ignores a malformed order token", () => {
    expect(kindsFor("order:nope")).toEqual([]);
    expect(kindsFor("order:")).toEqual([]);
  });

  it("lists every active kind in canonical order", () => {
    expect(kindsFor("age:<7d file_size:>1mb")).toEqual(["file_size", "age"]);
    expect(kindsFor("age:<7d order:tag_count")).toEqual(["age", "tag_count"]);
  });

  it("de-duplicates a filter and order on the same kind", () => {
    expect(kindsFor("file_size:>1mb order:file_size")).toEqual(["file_size"]);
    expect(kindsFor("age:<7d order:date")).toEqual(["age"]);
  });

  it("omits kinds that have no meaningful subtitle", () => {
    expect(kindsFor("has:notes")).toEqual([]);
    expect(kindsFor("image_ratio:16/9")).toEqual([]);
    expect(kindsFor("order:image_ratio")).toEqual([]);
    expect(kindsFor("mime_type:video/mp4")).toEqual([]);
  });
});

describe("getPostSubtitles", () => {
  const post = {
    file_size: 2_500_000,
    duration_ms: 94_000,
    width: 1920,
    height: 1080,
    created_at: new Date(2026, 2, 14, 12, 0, 0).getTime(),
    tag_count: 7,
  };

  it("renders nothing without kinds", () => {
    expect(getPostSubtitles(post, [])).toEqual([]);
    expect(getPostSubtitles(post, null)).toEqual([]);
    expect(getPostSubtitles(null, ["file_size"])).toEqual([]);
  });

  it("renders one entry per kind, in the order given", () => {
    expect(getPostSubtitles(post, ["file_size", "age"])).toEqual([
      { kind: "file_size", text: "2.38 MB" },
      { kind: "age", text: "2026-03-14" },
    ]);
  });

  it("formats each kind", () => {
    expect(getPostSubtitles(post, ["file_size"])[0].text).toBe("2.38 MB");
    expect(getPostSubtitles(post, ["age"])[0].text).toBe("2026-03-14");
    expect(getPostSubtitles(post, ["tag_count"])[0].text).toBe("7 tags");
  });

  it("keeps the tag count readable when stacked with other lines", () => {
    expect(getPostSubtitles({ tag_count: 1 }, ["tag_count"])[0].text).toBe("1 tag");
    expect(getPostSubtitles({ tag_count: 0 }, ["tag_count"])[0].text).toBe("0 tags");
  });

  it("drops an unknown kind", () => {
    expect(getPostSubtitles(post, ["not_a_kind"])).toEqual([]);
  });

  // A missing value must not read as a real measurement of zero.
  it("drops kinds whose value is missing on this post", () => {
    expect(getPostSubtitles({ file_size: null }, ["file_size"])).toEqual([]);
    expect(getPostSubtitles({ file_size: 0 }, ["file_size"])).toEqual([]);
    expect(getPostSubtitles({ created_at: null }, ["age"])).toEqual([]);
    expect(getPostSubtitles({ tag_count: null }, ["tag_count"])).toEqual([]);
  });

  it("keeps the surviving lines when only some values are missing", () => {
    expect(getPostSubtitles(
      { file_size: 2_500_000, created_at: null },
      ["file_size", "age"]
    )).toEqual([{ kind: "file_size", text: "2.38 MB" }]);
  });
});

describe("formatDate", () => {
  it("formats a millisecond timestamp as a local ISO date", () => {
    expect(formatDate(new Date(2026, 0, 5).getTime())).toBe("2026-01-05");
    expect(formatDate(new Date(2026, 11, 31).getTime())).toBe("2026-12-31");
  });

  it("returns nothing for missing or unusable values", () => {
    expect(formatDate(0)).toBe("");
    expect(formatDate(-1)).toBe("");
    expect(formatDate(null)).toBe("");
    expect(formatDate("abc")).toBe("");
  });
});
