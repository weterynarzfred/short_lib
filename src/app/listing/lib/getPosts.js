import db from "@/lib/db";
import buildQuery from "./buildQuery";
import parseSearch from "./parseSearch";

export default function getPosts(search) {
  const parsed = parseSearch(search);
  const { sql, params } = buildQuery(parsed);

  const posts = db.prepare(sql).all(...params);
  posts.forEach(post => {
    post.variants = JSON.parse(post.variants);
    post.tags = JSON.parse(post.tags);
  });

  return posts;
}
