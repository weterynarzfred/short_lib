import { describe, expect, it } from "vitest";

import chooseComboboxTag from "../src/lib/chooseComboboxTag";

describe("chooseComboboxTag", () => {
  it("replaces current token and keeps a leading negation sign", () => {
    const result = chooseComboboxTag({
      prev: "cat -do",
      cursor: 7,
      tag: { name: "dog", type: "tag" },
    });

    expect(result).toEqual({
      next: "cat -dog ",
      nextCursor: 9,
    });
  });

  it("does not add an extra separator for operator tags", () => {
    const result = chooseComboboxTag({
      prev: "mime_ty",
      cursor: 7,
      tag: { name: "mime_type:", type: "operator" },
    });

    expect(result).toEqual({
      next: "mime_type:",
      nextCursor: 10,
    });
  });

  it("opens an empty quoted phrase for free-text operators and lands inside it", () => {
    const result = chooseComboboxTag({
      prev: "note",
      cursor: 4,
      tag: { name: "notes:", type: "operator", quoted: true },
    });

    expect(result).toEqual({
      next: "notes:\"\"",
      nextCursor: 7,
    });
    // The caret must sit between the quotes, ready for the phrase.
    expect(result.next.slice(result.nextCursor)).toBe("\"");
  });

  it("keeps surrounding tokens intact when opening a quoted phrase", () => {
    const result = chooseComboboxTag({
      prev: "cat note dog",
      cursor: 8,
      tag: { name: "notes:", type: "operator", quoted: true },
    });

    expect(result.next).toBe("cat notes:\"\" dog");
    expect(result.next.slice(result.nextCursor)).toBe("\" dog");
  });

  it("does not quote operators that take a value from a list", () => {
    const result = chooseComboboxTag({
      prev: "ord",
      cursor: 3,
      tag: { name: "order:", type: "operator", quoted: false },
    });

    expect(result).toEqual({
      next: "order:",
      nextCursor: 6,
    });
  });

  it("keeps exactly one space when there is already a token separator after selection", () => {
    const result = chooseComboboxTag({
      prev: "do other",
      cursor: 2,
      tag: { name: "dog", type: "tag" },
    });

    expect(result).toEqual({
      next: "dog other",
      nextCursor: 4,
    });
  });

  it("consumes matching characters to the right of cursor", () => {
    const result = chooseComboboxTag({
      prev: "categoother_tag",
      cursor: 3,
      tag: { name: "category", type: "tag" },
    });

    expect(result).toEqual({
      next: "category other_tag",
      nextCursor: 9,
    });
  });
});
