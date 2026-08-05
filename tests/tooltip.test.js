// Placement, timing and dismissal all need a browser; this is the piece that does not.
import { describe, expect, it } from "vitest";

import isWithinRect from "@/lib/isWithinRect";

// Decides when an open tooltip closes. Without the padding the few pixels between a tag
// and its card are a dead zone, and the card closes before its link can be clicked.
describe("isWithinRect", () => {
  const rect = { top: 100, bottom: 120, left: 200, right: 300 };

  it("accepts points inside and on the edges", () => {
    expect(isWithinRect(rect, 250, 110, 0)).toBe(true);
    expect(isWithinRect(rect, 200, 100, 0)).toBe(true);
    expect(isWithinRect(rect, 300, 120, 0)).toBe(true);
  });

  it("rejects points outside", () => {
    expect(isWithinRect(rect, 250, 130, 0)).toBe(false);
    expect(isWithinRect(rect, 199, 110, 0)).toBe(false);
  });

  it("bridges the gap below a tag with padding", () => {
    // The card sits 6px under the anchor; without slack this point closes it.
    expect(isWithinRect(rect, 250, 126, 0)).toBe(false);
    expect(isWithinRect(rect, 250, 126, 12)).toBe(true);
  });

  it("still rejects points beyond the padding", () => {
    expect(isWithinRect(rect, 250, 140, 12)).toBe(false);
  });

  it("treats a missing rect as not containing anything", () => {
    expect(isWithinRect(null, 250, 110, 12)).toBe(false);
    expect(isWithinRect(undefined, 250, 110, 12)).toBe(false);
  });
});
