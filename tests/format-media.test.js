import { describe, expect, it } from "vitest";

import formatDuration from "../src/lib/formatDuration";
import formatMegapixels from "../src/lib/formatMegapixels";

describe("formatDuration", () => {
  it("formats sub-hour durations as m:ss", () => {
    expect(formatDuration(94_000)).toBe("1:34");
    expect(formatDuration(9_000)).toBe("0:09");
    expect(formatDuration(600_000)).toBe("10:00");
  });

  it("formats hour-long durations as h:mm:ss", () => {
    expect(formatDuration(3_723_000)).toBe("1:02:03");
    expect(formatDuration(3_600_000)).toBe("1:00:00");
  });

  it("rounds to the nearest second", () => {
    expect(formatDuration(1_499)).toBe("0:01");
    expect(formatDuration(1_500)).toBe("0:02");
  });

  it("returns nothing for missing or non-positive values", () => {
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(-5)).toBe("");
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration("abc")).toBe("");
  });
});

describe("formatMegapixels", () => {
  it("keeps one decimal below ten megapixels", () => {
    expect(formatMegapixels(1920, 1080)).toBe("2.1MP");
    expect(formatMegapixels(512, 512)).toBe("0.3MP");
    expect(formatMegapixels(3840, 2160)).toBe("8.3MP");
  });

  it("rounds to whole megapixels at ten and above", () => {
    expect(formatMegapixels(4000, 3000)).toBe("12MP");
    expect(formatMegapixels(12000, 8000)).toBe("96MP");
  });

  it("reports tiny images as the smallest visible value", () => {
    expect(formatMegapixels(100, 100)).toBe("0.1MP");
    expect(formatMegapixels(2, 2)).toBe("0.1MP");
  });

  it("returns nothing when dimensions are missing", () => {
    expect(formatMegapixels(null, 1080)).toBe("");
    expect(formatMegapixels(1920, null)).toBe("");
    expect(formatMegapixels(0, 0)).toBe("");
    expect(formatMegapixels(undefined, undefined)).toBe("");
  });
});
