import { NextResponse } from "next/server";
import db from "@/lib/db";

const OPERATORS = [
  {
    key: "mime_type",
    label: "mime_type:",
    values: ["video/mp4", "video/webm", "image/jpeg", "image/png", "image/gif"],
  },
  {
    key: "file_size",
    label: "file_size:",
  },
  {
    key: "order",
    label: "order:",
    values: ["age", "duration", "file_size"],
  },
  {
    key: "age",
    label: "age:",
  },
];

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
  const operatorsEnabled = searchParams.get("noOps") !== "1";
  const colonIndex = q.indexOf(":");

  let suggestions = [];

  if (operatorsEnabled) {
    if (colonIndex === -1) {
      const matchingOps = OPERATORS.filter(op => op.label.startsWith(q));

      suggestions.push(
        ...matchingOps.map((op) => ({
          id: `op_${op.key}`,
          name: op.label,
          type: "operator",
          postCount: null,
        }))
      );
    }

    if (colonIndex !== -1) {
      const prefix = q.slice(0, colonIndex + 1);
      const valuePart = q.slice(colonIndex + 1);
      const operator = OPERATORS.find(op => op.label === prefix);

      if (operator?.values) {
        const matchingValues = operator.values.filter(v =>
          v.toLowerCase().startsWith(valuePart)
        );

        suggestions.push(
          ...matchingValues.map((v) => ({
            id: `op_${operator.key}_${v}`,
            name: `${operator.label}${v}`,
            type: "value",
            postCount: null,
          }))
        );

        return NextResponse.json({ tags: suggestions });
      }
    }
  }

  const rows = stmt.all(q);
  const tagSuggestions = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    postCount: r.post_count,
  }));

  return NextResponse.json({
    tags: [...suggestions, ...tagSuggestions],
  });
}
