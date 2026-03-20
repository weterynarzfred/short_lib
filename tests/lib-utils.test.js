import { describe, expect, it } from "vitest";

import scaleToTotalPixels from "../src/lib/scaleToTotalPixels";
import mimetypeToType from "../src/app/api/upload/mimetypeToType";

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
