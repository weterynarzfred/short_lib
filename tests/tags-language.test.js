import { describe, expect, it } from "vitest";
import { languages, tokenize } from "prism-code-editor/prism";

import {
  registerKnownTags,
  registerKnownTagsFromValue,
} from "@/lib/tagsLanguage";
import parseTagToken from "@/lib/parseTagToken";

function tokenizeTagCode(code) {
  return languages.tags[tokenize](code)
    .filter(token => typeof token !== "string")
    .map(token => ({
      type: token.type,
      content: token.content,
    }));
}

describe("tags language tokenizer", () => {
  it("uses explicit type prefix when token includes type:name", () => {
    const tokens = tokenizeTagCode("meta:video creator:artist_name");

    expect(tokens).toEqual([
      { type: "tag-type-meta", content: "meta:video" },
      { type: "tag-type-creator", content: "creator:artist_name" },
    ]);
  });

  it("colors bare known tags based on registered type", () => {
    registerKnownTags([
      { name: "video", type: "meta" },
      { name: "artist_name", type: "creator" },
    ]);

    const tokens = tokenizeTagCode("video artist_name");

    expect(tokens).toEqual([
      { type: "tag-type-meta", content: "video" },
      { type: "tag-type-creator", content: "artist_name" },
    ]);
  });

  it("registers typed tokens from editor value and reuses types for bare tokens", () => {
    registerKnownTagsFromValue("meta:has_audio -creator:alice");

    const tokens = tokenizeTagCode("has_audio -alice");

    expect(tokens).toEqual([
      { type: "tag-type-meta", content: "has_audio" },
      { type: "tag-type-creator", content: "-alice" },
    ]);
  });

  it("falls back to general for unknown bare tags", () => {
    const tokens = tokenizeTagCode("__unregistered_tag__");

    expect(tokens).toEqual([
      { type: "tag-type-general", content: "__unregistered_tag__" },
    ]);
  });
});

describe("parseTagToken", () => {
  it("reads a bare tag", () => {
    expect(parseTagToken("cat")).toEqual({ name: "cat", type: "", negated: false });
  });

  it("reads a typed tag", () => {
    expect(parseTagToken("meta:image"))
      .toEqual({ name: "image", type: "meta", negated: false });
  });

  it("reads negation", () => {
    expect(parseTagToken("-cat")).toEqual({ name: "cat", type: "", negated: true });
    expect(parseTagToken("-meta:image"))
      .toEqual({ name: "image", type: "meta", negated: true });
  });

  // A colon at either end belongs to the name, matching parseTagString.
  it("treats an edge colon as part of the name", () => {
    expect(parseTagToken(":cat")).toMatchObject({ name: ":cat", type: "" });
    expect(parseTagToken("cat:")).toMatchObject({ name: "cat:", type: "" });
  });

  it("keeps later colons in the name", () => {
    expect(parseTagToken("series:one:two"))
      .toEqual({ name: "one:two", type: "series", negated: false });
  });

  it("survives empty input", () => {
    expect(parseTagToken("")).toEqual({ name: "", type: "", negated: false });
    expect(parseTagToken(null)).toEqual({ name: "", type: "", negated: false });
    expect(parseTagToken(undefined)).toEqual({ name: "", type: "", negated: false });
    expect(parseTagToken("  cat  ")).toMatchObject({ name: "cat" });
  });
});

// The hover hook finds tags by querying `span.token` and reading textContent. That is an
// assumption about markup this project does not generate itself, so it is pinned here:
// if prism's output shape changes, hovering silently stops working with nothing else
// failing.
describe("tag token markup", () => {
  it("renders each tag as a token span carrying the raw text", async () => {
    const { highlightText, languages } = await import("prism-code-editor/prism");
    // Registers languages.tags as a side effect.
    await import("@/lib/tagsLanguage");

    const html = highlightText("cat meta:image -dog", languages.tags);

    expect(html).toContain(`<span class="token tag-type-general">cat</span>`);
    expect(html).toContain(`<span class="token tag-type-meta">meta:image</span>`);
    expect(html).toContain(`<span class="token tag-type-general">-dog</span>`);
  });

  it("leaves whitespace outside the token spans", async () => {
    const { highlightText, languages } = await import("prism-code-editor/prism");
    // Registers languages.tags as a side effect.
    await import("@/lib/tagsLanguage");

    const html = highlightText("cat dog", languages.tags);

    // A span whose text is only whitespace would become a hoverable dead zone.
    expect(html).not.toMatch(/<span class="token[^"]*">\s+<\/span>/);
  });
});
