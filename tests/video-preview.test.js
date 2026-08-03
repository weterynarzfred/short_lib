import { describe, expect, it } from "vitest";

import {
  buildPreviewArgs,
  DEFAULT_PREVIEW_PIXELS,
  planPreviewSegments,
  planPreviewSize,
  PREVIEW_SEGMENTS,
  PREVIEW_SEGMENT_SECONDS,
  PREVIEW_TOTAL_SECONDS,
} from "@/lib/generateVideoPreview";

describe("planPreviewSize", () => {
  const pixelsOf = size => size.width * size.height;

  // The reported problem: capping width alone gave tall videos far more pixels than wide
  // ones, so a 9:16 clip rendered enormous next to a 16:9 one.
  it("gives portrait and landscape the same pixel budget", () => {
    const landscape = planPreviewSize(1920, 1080, 100_000);
    const portrait = planPreviewSize(1080, 1920, 100_000);

    expect(pixelsOf(landscape)).toBeLessThanOrEqual(100_000);
    expect(pixelsOf(portrait)).toBeLessThanOrEqual(100_000);
    expect(Math.abs(pixelsOf(landscape) - pixelsOf(portrait))).toBeLessThan(2_000);
  });

  it("preserves aspect ratio", () => {
    const size = planPreviewSize(1920, 1080, 100_000);
    expect(size.width / size.height).toBeCloseTo(16 / 9, 1);

    const tall = planPreviewSize(1080, 1920, 100_000);
    expect(tall.width / tall.height).toBeCloseTo(9 / 16, 1);
  });

  it("returns even dimensions, which yuv420p requires", () => {
    for (const [w, h] of [[1920, 1080], [1080, 1920], [1023, 767], [640, 361]]) {
      const size = planPreviewSize(w, h, 100_000);
      expect(size.width % 2).toBe(0);
      expect(size.height % 2).toBe(0);
    }
  });

  it("never upscales a source already under budget", () => {
    expect(planPreviewSize(320, 240, 100_000)).toEqual({ width: 320, height: 240 });
  });

  it("rejects unusable dimensions or budgets", () => {
    expect(planPreviewSize(0, 1080, 100_000)).toBeNull();
    expect(planPreviewSize(1920, null, 100_000)).toBeNull();
    expect(planPreviewSize(1920, 1080, 0)).toBeNull();
    expect(planPreviewSize(undefined, undefined)).toBeNull();
  });

  it("defaults to the documented budget", () => {
    expect(pixelsOf(planPreviewSize(1920, 1080)))
      .toBeLessThanOrEqual(DEFAULT_PREVIEW_PIXELS);
  });
});

describe("planPreviewSegments", () => {
  it("uses the whole clip when it is no longer than the preview", () => {
    expect(planPreviewSegments(6)).toEqual([{ start: 0, duration: 6 }]);
    expect(planPreviewSegments(PREVIEW_TOTAL_SECONDS))
      .toEqual([{ start: 0, duration: PREVIEW_TOTAL_SECONDS }]);
  });

  it("samples evenly spaced segments from a longer clip", () => {
    const segments = planPreviewSegments(100);

    expect(segments).toHaveLength(PREVIEW_SEGMENTS);
    expect(segments.every(s => s.duration === PREVIEW_SEGMENT_SECONDS)).toBe(true);

    // Starts are rounded to milliseconds, so gaps can differ by 0.001s.
    const gaps = segments.slice(1).map((s, i) => s.start - segments[i].start);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 2);
  });

  // Opening titles and end credits are the least representative parts of a video.
  it("stays inside the middle 90 percent", () => {
    const duration = 200;
    const segments = planPreviewSegments(duration);

    expect(segments[0].start).toBeGreaterThanOrEqual(duration * 0.05);
    const last = segments.at(-1);
    expect(last.start + last.duration).toBeLessThanOrEqual(duration * 0.95 + 0.001);
  });

  it("never seeks past the end", () => {
    for (const duration of [11, 12.5, 30, 3829]) {
      const last = planPreviewSegments(duration).at(-1);
      expect(last.start + last.duration).toBeLessThanOrEqual(duration);
    }
  });

  it("rejects a missing or unusable duration", () => {
    expect(planPreviewSegments(0)).toBeNull();
    expect(planPreviewSegments(-5)).toBeNull();
    expect(planPreviewSegments(null)).toBeNull();
    expect(planPreviewSegments(undefined)).toBeNull();
    expect(planPreviewSegments("abc")).toBeNull();
  });
});

describe("buildPreviewArgs", () => {
  const segments = planPreviewSegments(100);
  const size = { width: 420, height: 236 };
  const args = buildPreviewArgs("in.mp4", "out.mp4", segments, size);
  const joined = args.join(" ");

  it("seeks before each input rather than decoding through the file", () => {
    // -ss ahead of -i is what keeps an hour-long source fast.
    for (const segment of segments) {
      const index = args.indexOf(String(segment.start));
      expect(args[index - 1]).toBe("-ss");
      expect(args.slice(index).indexOf("-i")).toBeGreaterThan(0);
    }

    expect(args.filter(arg => arg === "-i")).toHaveLength(PREVIEW_SEGMENTS);
  });

  it("concatenates the segments and scales to the planned size", () => {
    expect(joined).toContain(`concat=n=${PREVIEW_SEGMENTS}:v=1:a=0`);
    expect(joined).toContain("scale=420:236");
  });

  it("produces a silent clip", () => {
    expect(args).toContain("-an");
  });

  it("encodes with SVT-AV1", () => {
    expect(args).toContain("libsvtav1");
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("builds a single-input command for a short clip", () => {
    const shortArgs = buildPreviewArgs("in.mp4", "out.mp4", planPreviewSegments(4), size);

    expect(shortArgs.filter(arg => arg === "-i")).toHaveLength(1);
    expect(shortArgs.join(" ")).toContain("concat=n=1:v=1:a=0");
  });
});
