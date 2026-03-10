import db from "@/lib/db";
import buildQuery from "./buildQuery";
import parseSearch from "./parseSearch";

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
  });
}

export function getPostsPage(search, { offset = 0, limit } = {}) {
  const parsed = parseSearch(search);
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

  // Fetch one extra row to determine whether a next page exists.
  const { sql, params } = buildQuery(parsed, {
    limit: requestedLimit + 1,
    offset: safeOffset,
  });

  const rows = db.prepare(sql).all(...params);
  const hasMore = rows.length > requestedLimit;
  const posts = hasMore ? rows.slice(0, requestedLimit) : rows;
  normalizePosts(posts);

  return {
    posts,
    hasMore,
    nextOffset: safeOffset + posts.length,
  };
}

export default function getPosts(search, options = {}) {
  return getPostsPage(search, options).posts;
}
