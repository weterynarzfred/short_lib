import { describe, expect, it } from "vitest";

import {
  NOTES_CLIP_CHARS,
  clipNotes,
  getMetaParts,
} from "../src/app/listing/lib/postTooltipDetails";

const POST = {
  score: 3,
  created_at: new Date(2026, 0, 15, 12).getTime(),
  file_size: 2_500_000,
  width: 1920,
  height: 1080,
  mime_type: "video/mp4",
};

describe("clipNotes", () => {
  it("leaves short notes alone", () => {
    expect(clipNotes("a short note")).toBe("a short note");
  });

  it("returns nothing for missing or blank notes", () => {
    expect(clipNotes(null)).toBe("");
    expect(clipNotes("   ")).toBe("");
  });

  it("clips long notes on a word boundary", () => {
    const clipped = clipNotes("word ".repeat(200));

    expect(clipped.length).toBeLessThanOrEqual(NOTES_CLIP_CHARS + 1);
    expect(clipped.endsWith("…")).toBe(true);
    // The boundary cut must not leave a half word or a dangling space before the ellipsis.
    expect(clipped.endsWith("word…")).toBe(true);
  });

  it("cuts an unbroken run at the limit rather than losing most of it", () => {
    const clipped = clipNotes("x".repeat(1000));

    expect(clipped).toBe(`${"x".repeat(NOTES_CLIP_CHARS)}…`);
  });

  it("ignores a word boundary far from the limit", () => {
    // One space near the start, then a long unbroken run: cutting at that space would
    // throw away almost the whole clip to avoid breaking a word.
    const clipped = clipNotes(`note ${"x".repeat(1000)}`);

    expect(clipped).toBe(`note ${"x".repeat(NOTES_CLIP_CHARS - 5)}…`);
  });
});

describe("getMetaParts", () => {
  it("reports everything the card does not already show", () => {
    expect(getMetaParts(POST, [])).toEqual([
      "★★★",
      "2026-01-15",
      "2.38 MB",
      "1920×1080",
      "video/mp4",
    ]);
  });

  it("drops whatever the subtitle lines are already showing", () => {
    expect(getMetaParts(POST, ["score", "age", "file_size"])).toEqual([
      "1920×1080",
      "video/mp4",
    ]);
  });

  it("drops values the post does not have", () => {
    expect(getMetaParts({ score: 0, mime_type: "audio/mpeg" }, [])).toEqual(["audio/mpeg"]);
  });

  it("keeps dimensions, which the megapixel badge does not give", () => {
    expect(getMetaParts({ width: 800, height: 600 }, ["score", "age", "file_size"]))
      .toEqual(["800×600"]);
  });
});
