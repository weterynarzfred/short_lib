// The small helpers behind the search box, the tag combobox and the upload queue. Each is
// a pure function precisely so it can be checked without a browser.
import { describe, expect, it } from "vitest";
import chooseComboboxTag from "@/lib/chooseComboboxTag";
import getActiveToken from "@/lib/listingQuery/getActiveToken";
import isEditableTarget from "@/lib/isEditableTarget";
import { isUploadSettled } from "@/app/upload/lib/useUploadQueue";

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

describe("getActiveToken", () => {
  it("reports the token the caret sits in", () => {
    expect(getActiveToken("cat dog", 7)).toMatchObject({
      start: 4,
      end: 7,
      token: "dog",
      query: "dog",
      inQuotes: false,
    });
  });

  it("reports only the text left of the caret as the query", () => {
    expect(getActiveToken("cat dog", 6)).toMatchObject({
      start: 4,
      end: 7,
      token: "dog",
      query: "do",
    });
  });

  it("strips a leading negation sign from the query but not the token", () => {
    expect(getActiveToken("cat -dog", 8)).toMatchObject({
      start: 4,
      token: "-dog",
      query: "dog",
    });
  });

  it("defaults the caret to the end of the value", () => {
    expect(getActiveToken("cat do")).toMatchObject({ query: "do", start: 4 });
  });

  it("clamps a caret outside the value", () => {
    expect(getActiveToken("cat", 99)).toMatchObject({ query: "cat", end: 3 });
    expect(getActiveToken("cat", -5)).toMatchObject({ query: "", start: 0 });
  });

  it("returns an empty query just after a separator", () => {
    expect(getActiveToken("cat ", 4)).toMatchObject({ query: "", start: 4, end: 4 });
  });

  // The reported bug: whitespace inside a quoted phrase must not start a new token.
  it("treats an unclosed quoted phrase as one token and flags the caret as inside it", () => {
    const result = getActiveToken("notes:\"that's the fi", 20);

    expect(result.inQuotes).toBe(true);
    expect(result.start).toBe(0);
    expect(result.query).not.toBe("fi");
  });

  it("flags the caret as inside quotes immediately after the opening quote", () => {
    expect(getActiveToken("notes:\"", 7).inQuotes).toBe(true);
  });

  it("clears the flag once the phrase is closed", () => {
    expect(getActiveToken("notes:\"hello world\"", 19).inQuotes).toBe(false);
  });

  it("resumes normal tokenising after a closed phrase", () => {
    const result = getActiveToken("notes:\"hello world\" ca", 22);

    expect(result).toMatchObject({
      start: 20,
      token: "ca",
      query: "ca",
      inQuotes: false,
    });
  });

  it("handles a second phrase after a closed one", () => {
    expect(getActiveToken("notes:\"one\" notes:\"tw", 21).inQuotes).toBe(true);
  });

  it("does not let an escaped quote toggle the phrase", () => {
    // notes:"say \"hi -> still inside the phrase the caret opened.
    expect(getActiveToken("notes:\"say \\\"hi", 15).inQuotes).toBe(true);
    // A backslash-escaped quote outside any phrase leaves the caret outside.
    expect(getActiveToken("cat \\\" do", 9).inQuotes).toBe(false);
  });

  it("closes the token at the next unquoted separator, not inside a phrase", () => {
    expect(getActiveToken("notes:\"a b\" tail", 8)).toMatchObject({
      start: 0,
      end: 11,
      inQuotes: true,
    });
  });

  it("survives empty and missing input", () => {
    expect(getActiveToken("", 0)).toMatchObject({ query: "", inQuotes: false });
    expect(getActiveToken()).toMatchObject({ query: "", inQuotes: false });
    expect(getActiveToken(null, 0)).toMatchObject({ query: "", inQuotes: false });
  });
});

// Minimal stand-in: the real thing only ever reads tagName and isContentEditable.
const element = (tagName, isContentEditable = false) => ({ tagName, isContentEditable });

describe("isEditableTarget", () => {
  // Post navigation binds ArrowUp/ArrowDown, which are also caret keys, so anything that
  // takes typed input has to be excluded or the caret moves and the post changes at once.
  it("recognises fields that take typed input", () => {
    expect(isEditableTarget(element("INPUT"))).toBe(true);
    expect(isEditableTarget(element("TEXTAREA"))).toBe(true);
    expect(isEditableTarget(element("SELECT"))).toBe(true);
  });

  it("recognises contenteditable regardless of tag", () => {
    expect(isEditableTarget(element("DIV", true))).toBe(true);
    expect(isEditableTarget(element("SPAN", true))).toBe(true);
  });

  // The panel focuses the media element on open, so this is the common case for a
  // keystroke and must not be treated as editable.
  it("does not claim ordinary elements", () => {
    expect(isEditableTarget(element("VIDEO"))).toBe(false);
    expect(isEditableTarget(element("IMG"))).toBe(false);
    expect(isEditableTarget(element("DIV"))).toBe(false);
    expect(isEditableTarget(element("BODY"))).toBe(false);
    expect(isEditableTarget(element("BUTTON"))).toBe(false);
  });

  it("survives a missing target", () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
    expect(isEditableTarget({})).toBe(false);
  });
});

describe("isUploadSettled", () => {
  it("treats finished and failed uploads as settled", () => {
    expect(isUploadSettled({ done: true, failed: false })).toBe(true);
    expect(isUploadSettled({ done: false, failed: true })).toBe(true);
  });

  // The whole point of the reset behaviour: a transfer in progress is never dropped.
  it("does not treat a transfer in progress as settled", () => {
    expect(isUploadSettled({ done: false, failed: false, progress: 0 })).toBe(false);
    expect(isUploadSettled({ done: false, failed: false, progress: 42 })).toBe(false);
  });

  it("survives missing input", () => {
    expect(isUploadSettled(undefined)).toBe(false);
    expect(isUploadSettled(null)).toBe(false);
    expect(isUploadSettled({})).toBe(false);
  });

  it("keeps exactly the in-flight entries when filtering a queue", () => {
    const uploads = [
      { id: "a", done: true, failed: false },
      { id: "b", done: false, failed: true },
      { id: "c", done: false, failed: false, progress: 42 },
      { id: "d", done: false, failed: false, progress: 0 },
    ];

    expect(uploads.filter(upload => !isUploadSettled(upload)).map(u => u.id))
      .toEqual(["c", "d"]);
  });
});
