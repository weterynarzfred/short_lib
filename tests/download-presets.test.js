import { describe, expect, it } from "vitest";

import {
  buildDownloadFilename,
  DOWNLOAD_PRESETS,
  getPresetsForMimeType,
  isPresetAllowed,
  parseTimestamp,
  resolveTrim,
  supportsTrim,
} from "@/lib/downloadPresets";

describe("parseTimestamp", () => {
  it("reads plain seconds", () => {
    expect(parseTimestamp("0")).toBe(0);
    expect(parseTimestamp("42")).toBe(42);
    expect(parseTimestamp("2.5")).toBe(2.5);
  });

  it("reads mm:ss and hh:mm:ss", () => {
    expect(parseTimestamp("1:30")).toBe(90);
    expect(parseTimestamp("0:05")).toBe(5);
    expect(parseTimestamp("1:02:03")).toBe(3723);
    expect(parseTimestamp("1:00:00.5")).toBe(3600.5);
  });

  it("rejects junk and negatives", () => {
    expect(parseTimestamp("abc")).toBeNull();
    expect(parseTimestamp("-5")).toBeNull();
    expect(parseTimestamp("1:2:3:4")).toBeNull();
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp(null)).toBeNull();
  });
});

describe("resolveTrim", () => {
  it("returns nothing when neither bound is given", () => {
    expect(resolveTrim("", "")).toBeNull();
    expect(resolveTrim(null, undefined)).toBeNull();
  });

  it("treats a missing start as zero", () => {
    expect(resolveTrim("", "0:10")).toEqual({ start: 0, duration: 10 });
  });

  it("leaves the duration open when only a start is given", () => {
    expect(resolveTrim("0:05", "")).toEqual({ start: 5, duration: null });
  });

  it("converts a start and end into a duration", () => {
    expect(resolveTrim("0:10", "0:25")).toEqual({ start: 10, duration: 15 });
  });

  // Silently producing an empty file would look like a broken download.
  it("rejects an end at or before the start", () => {
    expect(resolveTrim("0:20", "0:10")).toBeNull();
    expect(resolveTrim("0:20", "0:20")).toBeNull();
  });

  it("rejects unusable bounds", () => {
    expect(resolveTrim("abc", "0:10")).toEqual({ start: 0, duration: 10 });
    expect(resolveTrim("0:10", "abc")).toEqual({ start: 10, duration: null });
  });
});

describe("presets", () => {
  it("offers only presets matching the media type, plus original", () => {
    expect(getPresetsForMimeType("image/png").map(p => p.key)).toEqual(["original", "jpeg"]);
    expect(getPresetsForMimeType("audio/mpeg").map(p => p.key)).toEqual(["original", "mp3"]);
    expect(getPresetsForMimeType("video/mp4").map(p => p.key)).toEqual(["original", "av1"]);
    expect(getPresetsForMimeType("application/pdf").map(p => p.key)).toEqual(["original"]);
  });

  it("guards presets against the wrong media type", () => {
    expect(isPresetAllowed("jpeg", "image/png")).toBe(true);
    expect(isPresetAllowed("jpeg", "video/mp4")).toBe(false);
    expect(isPresetAllowed("av1", "audio/mpeg")).toBe(false);
    expect(isPresetAllowed("original", "application/pdf")).toBe(true);
    expect(isPresetAllowed("nope", "image/png")).toBe(false);
  });

  it("allows trimming only where there is a timeline", () => {
    expect(supportsTrim("video/mp4")).toBe(true);
    expect(supportsTrim("audio/mpeg")).toBe(true);
    expect(supportsTrim("image/png")).toBe(false);
  });
});

describe("buildDownloadFilename", () => {
  it("swaps the extension for the preset's", () => {
    expect(buildDownloadFilename("clip.mkv", DOWNLOAD_PRESETS.av1)).toBe("clip.mp4");
    expect(buildDownloadFilename("photo.png", DOWNLOAD_PRESETS.jpeg)).toBe("photo.jpg");
  });

  it("keeps the original extension for the original preset", () => {
    expect(buildDownloadFilename("clip.mkv", DOWNLOAD_PRESETS.original)).toBe("clip.mkv");
  });

  it("marks a trimmed file", () => {
    expect(buildDownloadFilename("clip.mkv", DOWNLOAD_PRESETS.av1, { trimmed: true }))
      .toBe("clip-clip.mp4");
  });

  it("falls back when there is no usable name", () => {
    expect(buildDownloadFilename("", DOWNLOAD_PRESETS.av1)).toBe("download.mp4");
    expect(buildDownloadFilename(null, DOWNLOAD_PRESETS.original)).toBe("download");
  });
});
