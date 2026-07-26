import db from "@/lib/db";
import buildQuery from "./buildQuery";
import parseSearch from "./parseSearch";
import getSubtitleKinds from "./subtitleKinds";
import {
  searchMediaIdsByFilename,
  searchMediaIdsByNotes,
  searchMediaIdsByText,
} from "@/lib/search";
import { resolveTagName } from "@/lib/tagAliases";

const FUZZY_FILTERS = [
  ["notes", "notesMediaIds", searchMediaIdsByNotes],
  ["text", "textMediaIds", searchMediaIdsByText],
  ["filename", "filenameMediaIds", searchMediaIdsByFilename],
];

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
  const subtitleKinds = getSubtitleKinds(parsed.filters);

  let rankedIds = null;

  for (const [filterKey, idsKey, resolve] of FUZZY_FILTERS) {
    if (!parsed.filters[filterKey]) continue;

    const mediaIds = await resolve(parsed.filters[filterKey], { limit: 10000 });
    if (!mediaIds.length) {
      return {
        posts: [],
        hasMore: false,
        nextOffset: safeOffset,
        subtitleKinds,
      };
    }

    parsed.filters[idsKey] = mediaIds;
    // With several fuzzy filters active the result is their intersection, so ordering by
    // any one of them is defensible; the first in FUZZY_FILTERS order wins.
    if (!rankedIds) rankedIds = mediaIds;
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
