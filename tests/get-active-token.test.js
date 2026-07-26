import { describe, expect, it } from "vitest";

import getActiveToken from "@/lib/listingQuery/getActiveToken";

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
