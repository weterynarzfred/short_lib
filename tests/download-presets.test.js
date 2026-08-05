import { describe, expect, it } from "vitest";

import {
  AUDIO_BITRATE,
  buildDownloadFilename,
  clampCrf,
  CRF_MAX,
  CRF_MIN,
  DEFAULT_CRF,
  DOWNLOAD_PRESETS,
  getPresetsForMimeType,
  isPresetAllowed,
  parseTimestamp,
  resolveOutputSeconds,
  resolveTargetBitrate,
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

describe("resolveOutputSeconds", () => {
  it("uses the whole duration when nothing is trimmed", () => {
    expect(resolveOutputSeconds(56_000, null)).toBe(56);
  });

  it("uses the trimmed span", () => {
    expect(resolveOutputSeconds(56_000, { start: 10, duration: 15 })).toBe(15);
  });

  it("measures from the start to the end when the trim is open-ended", () => {
    expect(resolveOutputSeconds(56_000, { start: 50, duration: null })).toBe(6);
  });

  // A trim can ask for more than remains; the output cannot be longer than the source.
  it("never exceeds what is left after the start", () => {
    expect(resolveOutputSeconds(56_000, { start: 50, duration: 30 })).toBe(6);
  });

  it("rejects a missing or unusable duration", () => {
    expect(resolveOutputSeconds(0, null)).toBeNull();
    expect(resolveOutputSeconds(null, null)).toBeNull();
    expect(resolveOutputSeconds(56_000, { start: 100, duration: null })).toBeNull();
  });
});

describe("resolveTargetBitrate", () => {
  it("divides the budget across the duration, paying for audio first", () => {
    const withAudio = resolveTargetBitrate({ targetMb: 3, seconds: 56.29 });
    const without = resolveTargetBitrate({ targetMb: 3, seconds: 56.29, withAudio: false });

    expect(without - withAudio).toBe(AUDIO_BITRATE);
    expect(withAudio).toBeGreaterThan(0);
  });

  it("scales with the target", () => {
    const small = resolveTargetBitrate({ targetMb: 1, seconds: 60 });
    const large = resolveTargetBitrate({ targetMb: 10, seconds: 60 });

    expect(large).toBeGreaterThan(small * 8);
  });

  // A tiny target on a long video leaves nothing for video once audio is paid for.
  it("refuses a target it cannot meet", () => {
    expect(resolveTargetBitrate({ targetMb: 1, seconds: 3600 })).toBeNull();
    expect(resolveTargetBitrate({ targetMb: 0, seconds: 60 })).toBeNull();
    expect(resolveTargetBitrate({ targetMb: -5, seconds: 60 })).toBeNull();
    expect(resolveTargetBitrate({ targetMb: "abc", seconds: 60 })).toBeNull();
    expect(resolveTargetBitrate({ targetMb: 5, seconds: 0 })).toBeNull();
  });

  // Dropping audio frees its whole share for the picture.
  it("gives the entire budget to video when audio is dropped", () => {
    const seconds = 60;
    const bitrate = resolveTargetBitrate({ targetMb: 5, seconds, withAudio: false });

    expect(bitrate).toBe(Math.floor((5 * 1024 * 1024 * 8) / seconds));
  });
});

describe("clampCrf", () => {
  // The whole range is offered on purpose, extremes included.
  it("keeps any value AV1 accepts", () => {
    expect(clampCrf(CRF_MIN)).toBe(CRF_MIN);
    expect(clampCrf(CRF_MAX)).toBe(CRF_MAX);
    expect(clampCrf(32)).toBe(32);
    expect(clampCrf("18")).toBe(18);
  });

  it("clamps out-of-range values rather than refusing them", () => {
    expect(clampCrf(-10)).toBe(CRF_MIN);
    expect(clampCrf(999)).toBe(CRF_MAX);
  });

  it("rounds fractions and falls back for junk", () => {
    expect(clampCrf(31.4)).toBe(31);
    expect(clampCrf(31.6)).toBe(32);
    expect(clampCrf("abc")).toBe(DEFAULT_CRF);
    expect(clampCrf(null)).toBe(DEFAULT_CRF);
    expect(clampCrf(undefined)).toBe(DEFAULT_CRF);
    expect(clampCrf("")).toBe(DEFAULT_CRF);
  });
});

describe("video options", () => {
  // Only the AV1 preset has a video encode to adjust: mp3 is audio-only, and jpeg and
  // original have no audio stage at all.
  it("belong to the av1 preset alone", () => {
    expect(DOWNLOAD_PRESETS.av1.videoOptions).toBe(true);
    expect(DOWNLOAD_PRESETS.mp3.videoOptions).toBeUndefined();
    expect(DOWNLOAD_PRESETS.jpeg.videoOptions).toBeUndefined();
    expect(DOWNLOAD_PRESETS.original.videoOptions).toBeUndefined();
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
