import { describe, expect, it } from "vitest";
import { languages, tokenize } from "prism-code-editor/prism";

import {
  registerKnownTags,
  registerKnownTagsFromValue,
} from "../src/lib/tagsLanguage";

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
