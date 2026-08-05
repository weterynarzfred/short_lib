import { describe, expect, it } from "vitest";

import isEditableTarget from "@/lib/isEditableTarget";

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
