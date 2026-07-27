import { languages, tokenize, Token } from "prism-code-editor/prism";

import parseTagToken from "@/lib/parseTagToken";

const TAG_TYPE_CLASS_CHAR_PATTERN = /[^a-zA-Z0-9_]/g;
const KNOWN_TAG_TYPES = new Map();

function normalizeTagName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeTagType(value) {
  const type = String(value ?? "").trim().toLowerCase();
  return type || "general";
}

function buildTagTypeClass(type) {
  const safeType = normalizeTagType(type).replace(TAG_TYPE_CLASS_CHAR_PATTERN, "_");
  return safeType ? `tag-type-${safeType}` : "tag-type-general";
}

function registerKnownTagType(name, type) {
  const normalizedName = normalizeTagName(name);
  const normalizedType = normalizeTagType(type);
  if (!normalizedName) return;
  KNOWN_TAG_TYPES.set(normalizedName, normalizedType);
}

// Only typed tokens register a type; a bare `cat` says nothing about which type it is.
function parseTypedTagToken(token) {
  const parsed = parseTagToken(token);
  return parsed.type ? parsed : null;
}

export function registerKnownTags(tags = []) {
  if (!Array.isArray(tags)) return;

  for (const rawTag of tags) {
    if (!rawTag) continue;

    if (typeof rawTag === "string") {
      const parsedTag = parseTypedTagToken(rawTag);
      if (!parsedTag) continue;
      registerKnownTagType(parsedTag.name, parsedTag.type);
      continue;
    }

    const name = typeof rawTag.name === "string" ? rawTag.name : "";
    const type = typeof rawTag.type === "string" ? rawTag.type : "";
    if (!name || !type) continue;
    registerKnownTagType(name, type);
  }
}

export function registerKnownTagsFromValue(value = "") {
  const tokens = String(value ?? "")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);

  registerKnownTags(tokens);
}

languages["tags"] = {
  [tokenize](code) {
    const result = [];
    const parts = code.split(/(\s+)/);

    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        result.push(part);
        continue;
      }

      const stripped = part.startsWith("-") ? part.slice(1) : part;
      const parsedTag = parseTypedTagToken(stripped);

      let tokenType;
      if (parsedTag) {
        registerKnownTagType(parsedTag.name, parsedTag.type);
        tokenType = buildTagTypeClass(parsedTag.type);
      } else {
        tokenType = buildTagTypeClass(KNOWN_TAG_TYPES.get(normalizeTagName(stripped)));
      }

      result.push(new Token(tokenType, part, part));
    }

    return result;
  },
};
