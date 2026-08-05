// The small pure helpers that turn stored numbers into the strings the UI shows.
import { describe, expect, it } from "vitest";

import formatBytes from "@/lib/formatBytes";
import formatDate from "@/lib/formatDate";
import formatDuration from "@/lib/formatDuration";
import formatMegapixels from "@/lib/formatMegapixels";
import mimetypeToType from "@/lib/mimetypeToType";
import scaleToTotalPixels from "@/lib/scaleToTotalPixels";

describe("formatDuration", () => {
  it("switches to hours only when there are hours", () => {
    expect(formatDuration(9_000)).toBe("0:09");
    expect(formatDuration(94_000)).toBe("1:34");
    expect(formatDuration(600_000)).toBe("10:00");
    expect(formatDuration(3_600_000)).toBe("1:00:00");
    expect(formatDuration(3_723_000)).toBe("1:02:03");
  });

  it("rounds to the nearest second", () => {
    expect(formatDuration(1_499)).toBe("0:01");
    expect(formatDuration(1_500)).toBe("0:02");
  });

  it("returns nothing for missing or non-positive values", () => {
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(-5)).toBe("");
    expect(formatDuration(null)).toBe("");
    expect(formatDuration("abc")).toBe("");
  });
});

describe("formatMegapixels", () => {
  it("keeps one decimal below ten megapixels and rounds above", () => {
    expect(formatMegapixels(512, 512)).toBe("0.3MP");
    expect(formatMegapixels(1920, 1080)).toBe("2.1MP");
    expect(formatMegapixels(3840, 2160)).toBe("8.3MP");
    expect(formatMegapixels(4000, 3000)).toBe("12MP");
    expect(formatMegapixels(12000, 8000)).toBe("96MP");
  });

  // Rounding an icon down to "0MP" would read as no image at all.
  it("reports tiny images as the smallest visible value", () => {
    expect(formatMegapixels(100, 100)).toBe("0.1MP");
    expect(formatMegapixels(2, 2)).toBe("0.1MP");
  });

  it("returns nothing when dimensions are missing", () => {
    expect(formatMegapixels(null, 1080)).toBe("");
    expect(formatMegapixels(1920, null)).toBe("");
    expect(formatMegapixels(0, 0)).toBe("");
  });
});

describe("formatBytes", () => {
  it("scales to the largest unit that leaves a readable number", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2_500_000)).toBe("2.38 MB");
    expect(formatBytes(1024 ** 3)).toBe("1.00 GB");
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

describe("mimetypeToType", () => {
  it("maps known mime groups and defaults to other", () => {
    expect(mimetypeToType("image/png")).toBe("image");
    expect(mimetypeToType("video/mp4")).toBe("video");
    expect(mimetypeToType("audio/mpeg")).toBe("audio");
    expect(mimetypeToType("text/markdown")).toBe("text");
    expect(mimetypeToType(" IMAGE/PNG ")).toBe("image");
    expect(mimetypeToType("application/pdf")).toBe("other");
    expect(mimetypeToType()).toBe("other");
  });
});

describe("scaleToTotalPixels", () => {
  it("keeps original dimensions if already under target", () => {
    expect(scaleToTotalPixels(100, 100, 20000)).toEqual({ width: 100, height: 100 });
  });

  it("scales down while preserving rough ratio", () => {
    const scaled = scaleToTotalPixels(4000, 2000, 1_000_000);

    expect(scaled.width).toBeLessThan(4000);
    expect(scaled.height).toBeLessThan(2000);
    expect(Math.abs(scaled.width / scaled.height - 2)).toBeLessThan(0.03);
  });
});
