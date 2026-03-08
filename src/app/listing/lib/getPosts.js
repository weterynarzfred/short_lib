import db from "@/lib/db";
import buildQuery from "./buildQuery";
import parseSearch from "./parseSearch";

function parseJsonWithFallback(value, fallback) {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default function getPosts(search) {
  const parsed = parseSearch(search);
  const { sql, params } = buildQuery(parsed);

  const posts = db.prepare(sql).all(...params);
  posts.forEach(post => {
    post.variants = parseJsonWithFallback(post.variants, null);
    post.tags = parseJsonWithFallback(post.tags, []);
  });

  return posts;
}
