import { describe, expect, it } from "vitest";

import extractSnippet, { SNIPPET_WINDOW } from "@/lib/listingQuery/extractSnippet";

const LONG = "x".repeat(200) + "NEEDLE" + "y".repeat(200);
const NEEDLE_AT = 200;

const range = (start, end) => ({ start, end });
const rendered = snippet => snippet.segments
  .map(segment => segment.isMatch ? `[${segment.text}]` : segment.text)
  .join("");

describe("extractSnippet", () => {
  it("splits the text around a single match", () => {
    const snippet = extractSnippet("the office chair jousting", [range(11, 15)]);

    expect(rendered(snippet)).toBe("the office [chair] jousting");
    expect(snippet.truncatedStart).toBe(false);
    expect(snippet.truncatedEnd).toBe(false);
  });

  // The reported gap: a multi-term search marked only one of the words it found.
  it("marks every range that falls inside the window", () => {
    const snippet = extractSnippet("the office chair jousting", [range(4, 9), range(11, 15)]);

    expect(rendered(snippet)).toBe("the [office] [chair] jousting");
  });

  it("merges overlapping and touching ranges into one mark", () => {
    expect(rendered(extractSnippet("abcdef", [range(1, 3), range(2, 4)])))
      .toBe("a[bcde]f");
    expect(rendered(extractSnippet("abcdef", [range(1, 2), range(3, 4)])))
      .toBe("a[bcde]f");
  });

  it("centres the window on the first range", () => {
    const snippet = extractSnippet(LONG, [range(NEEDLE_AT, NEEDLE_AT + 5)]);
    const [before] = snippet.segments;

    expect(before.text).toHaveLength(SNIPPET_WINDOW);
    expect(snippet.segments.find(segment => segment.isMatch).text).toBe("NEEDLE");
    expect(snippet.segments.at(-1).text).toHaveLength(SNIPPET_WINDOW);
    expect(snippet.truncatedStart).toBe(true);
    expect(snippet.truncatedEnd).toBe(true);
  });

  it("drops ranges that fall outside the window", () => {
    const snippet = extractSnippet(LONG, [range(NEEDLE_AT, NEEDLE_AT + 5), range(0, 3)]);

    expect(snippet.segments.filter(segment => segment.isMatch)).toHaveLength(1);
  });

  it("honours a custom window", () => {
    const snippet = extractSnippet(LONG, [range(NEEDLE_AT, NEEDLE_AT + 5)], { window: 10 });

    expect(snippet.segments[0].text).toHaveLength(10);
    expect(snippet.segments.at(-1).text).toHaveLength(10);
  });

  it("handles a match at the very start and end", () => {
    const atStart = extractSnippet("needle in text", [range(0, 5)]);
    expect(rendered(atStart)).toBe("[needle] in text");
    expect(atStart.truncatedStart).toBe(false);

    const atEnd = extractSnippet("text with needle", [range(10, 15)]);
    expect(rendered(atEnd)).toBe("text with [needle]");
    expect(atEnd.truncatedEnd).toBe(false);
  });

  it("clamps a range that runs past the end of the text", () => {
    expect(rendered(extractSnippet("short", [range(2, 99)]))).toBe("sh[ort]");
  });

  // Fuse does not always report indices; the note should still be readable.
  it("falls back to the opening of the text without a usable range", () => {
    const snippet = extractSnippet(LONG, []);

    expect(snippet.segments).toHaveLength(1);
    expect(snippet.segments[0].isMatch).toBe(false);
    expect(snippet.segments[0].text).toHaveLength(SNIPPET_WINDOW * 2);
    expect(snippet.truncatedEnd).toBe(true);

    expect(rendered(extractSnippet("a short note", null))).toBe("a short note");
  });

  it("rejects nonsensical ranges rather than producing a broken snippet", () => {
    expect(rendered(extractSnippet("some text", [range(5, 2)]))).toBe("some text");
    expect(rendered(extractSnippet("some text", [range(-3, 4)]))).toBe("some text");
    expect(rendered(extractSnippet("some text", [range(99, 120)]))).toBe("some text");
    // Number(null) is 0, which must not read as a match at the start.
    expect(rendered(extractSnippet("some text", [{ start: null, end: null }])))
      .toBe("some text");
  });

  it("returns nothing for empty text", () => {
    expect(extractSnippet("", [range(0, 3)])).toBeNull();
    expect(extractSnippet(null, [range(0, 3)])).toBeNull();
    expect(extractSnippet(undefined, [range(0, 3)])).toBeNull();
  });
});
