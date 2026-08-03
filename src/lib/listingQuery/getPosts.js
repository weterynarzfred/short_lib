import db from "@/lib/db";
import buildQuery from "./buildQuery";
import parseSearch from "./parseSearch";
import getSubtitleKinds from "./subtitleKinds";
import {
  searchMediaMatchesByFilename,
  searchMediaMatchesByNotes,
  searchMediaMatchesByText,
} from "@/lib/search";
import extractSnippet from "./extractSnippet";
import { resolveTagName } from "@/lib/tagAliases";

const FUZZY_RESOLVERS = {
  notes: searchMediaMatchesByNotes,
  text: searchMediaMatchesByText,
  filename: searchMediaMatchesByFilename,
};

// Depth-first in written order, so "the first fuzzy term" means the leftmost one the user
// typed - which is the one whose ranking drives relevance ordering and snippets.
function collectFuzzyTerms(node, found = []) {
  if (!node) return found;

  if (node.type === "TERM") {
    if (FUZZY_RESOLVERS[node.kind]) found.push(node);
    return found;
  }

  collectFuzzyTerms(node.left, found);
  collectFuzzyTerms(node.right, found);

  return found;
}

// Built here rather than in the client so a page-long OCR note never crosses the wire.
function attachMatchSnippets(posts, matchByMediaId) {
  if (!matchByMediaId) return;

  for (const post of posts) {
    const match = matchByMediaId.get(post.id);
    if (!match) continue;

    if (match.field === "filename") {
      const filename = String(post.original_filename ?? "").trim();
      if (!filename) continue;

      // Short enough to show whole, so there is no window and nothing to mark.
      post.match = {
        field: "filename",
        segments: [{ text: filename, isMatch: false }],
        truncatedStart: false,
        truncatedEnd: false,
      };
      continue;
    }

    const snippet = extractSnippet(post.notes_md, match.ranges);
    if (!snippet) continue;

    post.match = { field: "notes", ...snippet };
  }
}

function clampInt(value, { min, max, fallback }) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseJsonWithFallback(value, fallback) {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizePosts(posts) {
  posts.forEach(post => {
    post.variants = parseJsonWithFallback(post.variants, null);
    post.tags = parseJsonWithFallback(post.tags, []);
    post.mime_type = typeof post.mime_type === "string"
      ? post.mime_type.trim().toLowerCase()
      : "";
  });
}

export async function getPostsPage(search, { offset = 0, limit, defaultExcludedTags, tagOrderSql } = {}) {
  const parsed = parseSearch(search, { defaultExcludedTags, resolveTagName });
  const requestedLimit = clampInt(limit ?? parsed.filters.limit, {
    min: 1,
    max: 500,
    fallback: 100,
  });

  const safeOffset = clampInt(offset, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    fallback: 0,
  });

  // Constant for a given search, so it is reported per page rather than per post.
  const subtitleKinds = getSubtitleKinds(parsed);

  let rankedIds = null;
  let matchByMediaId = null;

  for (const term of collectFuzzyTerms(parsed.expression)) {
    const matches = await FUZZY_RESOLVERS[term.kind](term.query, { limit: 10000 });

    // Resolved onto the term itself: it may sit inside an OR, where no matches means that
    // branch fails rather than the whole query.
    term.mediaIds = matches.map(row => row.mediaId);

    // Only the first positive term supplies ranking and snippets. A negated one describes
    // what to exclude, so its ranking says nothing about what is shown.
    if (!rankedIds && !term.negated && term.mediaIds.length) {
      rankedIds = term.mediaIds;
      matchByMediaId = new Map(matches.map(row => [row.mediaId, row]));
    }
  }

  // A fuzzy search is a request for the best match, so relevance beats newest-first -
  // unless an explicit order: token said otherwise.
  const relevanceIds = rankedIds && !parsed.filters.orderKey ? rankedIds : null;

  // Fetch one extra row to determine whether a next page exists.
  const { sql, params } = buildQuery(parsed, {
    limit: requestedLimit + 1,
    offset: safeOffset,
    tagOrderSql,
    relevanceIds,
  });

  // Values are bound and orderBy comes from a whitelist, so a failure here is a
  // bug rather than bad input - surface it instead of showing an empty library.
  let rows;
  try {
    rows = db.prepare(sql).all(...params);
  } catch (error) {
    console.error("Listing query failed", { search, sql, params, error });
    throw error;
  }

  const hasMore = rows.length > requestedLimit;
  const posts = hasMore ? rows.slice(0, requestedLimit) : rows;
  normalizePosts(posts);
  attachMatchSnippets(posts, matchByMediaId);

  return {
    posts,
    hasMore,
    nextOffset: safeOffset + posts.length,
    subtitleKinds,
  };
}

export default async function getPosts(search, options = {}) {
  return (await getPostsPage(search, options)).posts;
}
