// Everything that decides what a listing card says: its badge, its subtitle lines, and the
// hover tooltip. All pure functions over a post row.
import { describe, expect, it } from "vitest";

import getPostBadgeLabel, { getFileExtension } from "@/app/listing/lib/postBadge";
import getPostSubtitles from "@/app/listing/lib/postSubtitle";
import getSubtitleKinds from "@/lib/listingQuery/subtitleKinds";
import parseSearch from "@/lib/listingQuery/parseSearch";
import {
  NOTES_CLIP_CHARS,
  clipNotes,
  getMetaParts,
} from "@/app/listing/lib/postTooltipDetails";

const kindsFor = search => getSubtitleKinds(parseSearch(search));

describe("getPostBadgeLabel", () => {
  it("reads the extension from the stored path", () => {
    expect(getFileExtension({ file_path: "2026/03/abc.JPG" })).toBe("jpg");
    expect(getFileExtension({ file_path: "2026/03/abc.tar.gz" })).toBe("gz");
  });

  it("falls back when there is no usable extension", () => {
    expect(getFileExtension({ file_path: "2026/03/abc" })).toBe("file");
    expect(getFileExtension({ file_path: "2026/03/abc." })).toBe("file");
    expect(getFileExtension()).toBe("file");
  });

  it("shows the parts that make sense for the media type", () => {
    expect(getPostBadgeLabel({
      file_path: "2026/03/a.mp4",
      mime_type: "video/mp4",
      duration_ms: 94_000,
      width: 1920,
      height: 1080,
    })).toBe("1:34 · 2.1MP · MP4");

    // No duration for a still, no megapixels for audio.
    expect(getPostBadgeLabel({
      file_path: "2026/03/a.jpg",
      mime_type: "image/jpeg",
      width: 1920,
      height: 1080,
    })).toBe("2.1MP · JPG");

    expect(getPostBadgeLabel({
      file_path: "2026/03/a.mp3",
      mime_type: "audio/mpeg",
      duration_ms: 185_000,
    })).toBe("3:05 · MP3");

    // An unrecognised type gets the extension alone.
    expect(getPostBadgeLabel({
      file_path: "2026/03/a.pdf",
      mime_type: "application/pdf",
      width: 800,
      height: 600,
    })).toBe("PDF");
  });

  it("drops parts whose data is missing rather than showing placeholders", () => {
    // A video whose ffprobe pass yielded neither duration nor dimensions.
    expect(getPostBadgeLabel({
      file_path: "2026/03/a.mkv",
      mime_type: "video/x-matroska",
      duration_ms: null,
      width: null,
      height: null,
    })).toBe("MKV");

    expect(getPostBadgeLabel({
      file_path: "2026/03/a.webm",
      mime_type: "video/webm",
      duration_ms: 5_000,
      width: null,
      height: null,
    })).toBe("0:05 · WEBM");
  });
});

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
    // Direction is not a different kind.
    expect(kindsFor("order:file_size_asc")).toEqual(["file_size"]);
  });

  // Both already appear in every card's badge, so a subtitle line would just repeat them.
  it("has no subtitle for duration or pixel count", () => {
    expect(kindsFor("duration:<90s")).toEqual([]);
    expect(kindsFor("mpixels:>=2")).toEqual([]);
    expect(kindsFor("order:duration")).toEqual([]);
    expect(kindsFor("order:pixelcount")).toEqual([]);
    expect(kindsFor("duration:<90s mpixels:>=2 file_size:>1mb")).toEqual(["file_size"]);
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

  it("lists every active kind in canonical order, de-duplicated", () => {
    expect(kindsFor("age:<7d file_size:>1mb")).toEqual(["file_size", "age"]);
    expect(kindsFor("age:<7d order:tag_count")).toEqual(["age", "tag_count"]);
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

  it("renders one entry per kind, in the order given", () => {
    expect(getPostSubtitles(post, ["file_size", "age"])).toEqual([
      { kind: "file_size", text: "2.38 MB" },
      { kind: "age", text: "2026-03-14" },
    ]);
    expect(getPostSubtitles(post, ["tag_count"])[0].text).toBe("7 tags");
  });

  it("renders nothing without kinds or without a post", () => {
    expect(getPostSubtitles(post, [])).toEqual([]);
    expect(getPostSubtitles(null, ["file_size"])).toEqual([]);
    expect(getPostSubtitles(post, ["not_a_kind"])).toEqual([]);
  });

  // Zero tags is a real measurement, unlike a missing size, so it still gets a line.
  it("keeps the tag count readable when stacked with other lines", () => {
    expect(getPostSubtitles({ tag_count: 1 }, ["tag_count"])[0].text).toBe("1 tag");
    expect(getPostSubtitles({ tag_count: 0 }, ["tag_count"])[0].text).toBe("0 tags");
  });

  // A missing value must not read as a real measurement of zero.
  it("drops kinds whose value is missing, keeping the rest", () => {
    expect(getPostSubtitles({ file_size: null }, ["file_size"])).toEqual([]);
    expect(getPostSubtitles({ file_size: 0 }, ["file_size"])).toEqual([]);
    expect(getPostSubtitles({ created_at: null }, ["age"])).toEqual([]);
    expect(getPostSubtitles({ tag_count: null }, ["tag_count"])).toEqual([]);

    expect(getPostSubtitles(
      { file_size: 2_500_000, created_at: null },
      ["file_size", "age"]
    )).toEqual([{ kind: "file_size", text: "2.38 MB" }]);
  });
});

describe("clipNotes", () => {
  it("leaves short notes alone and drops empty ones", () => {
    expect(clipNotes("a short note")).toBe("a short note");
    expect(clipNotes(null)).toBe("");
    expect(clipNotes("   ")).toBe("");
  });

  it("clips long notes on a word boundary", () => {
    const clipped = clipNotes("word ".repeat(200));

    expect(clipped.length).toBeLessThanOrEqual(NOTES_CLIP_CHARS + 1);
    // No half word and no dangling space before the ellipsis.
    expect(clipped.endsWith("word…")).toBe(true);
  });

  it("cuts an unbroken run at the limit rather than losing most of it", () => {
    expect(clipNotes("x".repeat(1000))).toBe(`${"x".repeat(NOTES_CLIP_CHARS)}…`);
  });

  it("ignores a word boundary far from the limit", () => {
    // One space near the start, then a long unbroken run: cutting at that space would
    // throw away almost the whole clip to avoid breaking a word.
    expect(clipNotes(`note ${"x".repeat(1000)}`))
      .toBe(`note ${"x".repeat(NOTES_CLIP_CHARS - 5)}…`);
  });
});

describe("getMetaParts", () => {
  const post = {
    score: 3,
    created_at: new Date(2026, 0, 15, 12).getTime(),
    file_size: 2_500_000,
    width: 1920,
    height: 1080,
    mime_type: "video/mp4",
  };

  it("reports everything the card does not already show", () => {
    expect(getMetaParts(post, [])).toEqual([
      "★★★",
      "2026-01-15",
      "2.38 MB",
      "1920×1080",
      "video/mp4",
    ]);
  });

  it("drops whatever the subtitle lines are already showing", () => {
    expect(getMetaParts(post, ["score", "age", "file_size"])).toEqual([
      "1920×1080",
      "video/mp4",
    ]);
  });

  it("drops values the post does not have", () => {
    expect(getMetaParts({ score: 0, mime_type: "audio/mpeg" }, [])).toEqual(["audio/mpeg"]);
  });

  // Dimensions stay even though the badge shows megapixels: they answer a different
  // question, and there is no subtitle kind that would hide them.
  it("always keeps dimensions", () => {
    expect(getMetaParts({ width: 800, height: 600 }, ["score", "age", "file_size"]))
      .toEqual(["800×600"]);
  });
});
