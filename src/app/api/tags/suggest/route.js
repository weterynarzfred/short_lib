import { NextResponse } from "next/server";
import db from "@/lib/db";

const stmt = db.prepare(`
  SELECT
    t.id,
    t.name,
    t.type,
    COUNT(mt.media_id) AS post_count
  FROM tags t
  LEFT JOIN media_tags mt
    ON mt.tag_id = t.id
  WHERE t.name LIKE ? || '%'
  GROUP BY t.id, t.name, t.type
  ORDER BY post_count DESC, t.id ASC
  LIMIT 16
`);

export function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ tags: [] });

  const rows = stmt.all(q);

  return NextResponse.json({
    tags: rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      postCount: row.post_count,
    })),
  });
}
