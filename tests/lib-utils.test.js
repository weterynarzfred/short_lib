import { describe, expect, it } from "vitest";

import parseSearch from "../src/app/listing/lib/parseSearch";
import buildQuery from "../src/app/listing/lib/buildQuery";
import scaleToTotalPixels from "../src/lib/scaleToTotalPixels";
import mimetypeToType from "../src/app/api/upload/mimetypeToType";

describe("parseSearch", () => {
  it("splits include and exclude tags", () => {
    const parsed = parseSearch("cat -dog   sunset");

    expect(parsed.includeTags).toEqual(["cat", "sunset"]);
    expect(parsed.excludeTags).toEqual(["dog"]);
    expect(parsed.filters.limit).toBe(100);
  });

  it("applies limit and caps it at 500", () => {
    expect(parseSearch("limit:50").filters.limit).toBe(50);
    expect(parseSearch("limit:9999").filters.limit).toBe(500);
    expect(parseSearch("limit:0").filters.limit).toBe(100);
    expect(parseSearch("limit:-15").filters.limit).toBe(100);
  });
});

describe("buildQuery", () => {
  it("returns params in include-then-exclude order", () => {
    const parsed = parseSearch("cat sunset -dog");
    const { sql, params } = buildQuery(parsed);

    expect(params).toEqual(["cat", "sunset", "dog"]);
    expect(sql).toContain("JOIN media_tags mt1");
    expect(sql).toContain("JOIN media_tags mt2");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("ORDER BY m.created_at DESC");
    expect(sql).toContain("LIMIT 100");
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

describe("mimetypeToType", () => {
  it("maps known mime groups and defaults to other", () => {
    expect(mimetypeToType("image/png")).toBe("image");
    expect(mimetypeToType("video/mp4")).toBe("video");
    expect(mimetypeToType("audio/mpeg")).toBe("audio");
    expect(mimetypeToType("application/pdf")).toBe("other");
    expect(mimetypeToType()).toBe("other");
  });
});
