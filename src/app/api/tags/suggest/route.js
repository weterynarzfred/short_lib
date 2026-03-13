import { NextResponse } from "next/server";
import db from "@/lib/db";

const OPERATORS = [
  {
    key: "mime_type",
    label: "mime_type:",
  },
  {
    key: "file_size",
    label: "file_size:",
  },
  {
    key: "order",
    label: "order:",
    values: [
      "date",
      "date_asc",
      "duration",
      "duration_asc",
      "file_size",
      "file_size_asc",
      "pixelcount",
      "pixelcount_asc",
      "image_ratio",
      "image_ratio_asc",
      "tag_count",
      "tag_count_asc",
    ],
  },
  {
    key: "age",
    label: "age:",
  },
  {
    key: "mpixels",
    label: "mpixels:",
  },
  {
    key: "duration",
    label: "duration:",
  },
  {
    key: "notes",
    label: "notes:",
  },
  {
    key: "has",
    label: "has:",
  },
  {
    key: "image_ratio",
    label: "image_ratio:",
  },
  {
    key: "limit",
    label: "limit:",
  },
];

const stmt = db.prepare(`
  SELECT
    t.id,
    t.name,
    t.type,
    t.post_count
  FROM tags t
  WHERE t.name LIKE ? || '%'
  ORDER BY t.post_count DESC, t.id ASC
  LIMIT 16
`);

const mimeTypeValuesStmt = db.prepare(`
  SELECT
    LOWER(TRIM(m.mime_type)) AS value
  FROM media m
  WHERE TRIM(COALESCE(m.mime_type, '')) <> ''
  GROUP BY LOWER(TRIM(m.mime_type))
  ORDER BY COUNT(*) DESC, value ASC
  LIMIT 32
`);

const hasTypeValuesStmt = db.prepare(`
  SELECT
    LOWER(TRIM(t.type)) AS value
  FROM tags t
  WHERE TRIM(COALESCE(t.type, '')) <> ''
  GROUP BY LOWER(TRIM(t.type))
  ORDER BY COUNT(*) DESC, value ASC
  LIMIT 32
`);

function getOperatorValues(operator) {
  if (!operator) return [];

  if (Array.isArray(operator.values)) return operator.values;

  if (operator.key === "mime_type")
    return mimeTypeValuesStmt.all().map(row => row.value).filter(Boolean);

  if (operator.key === "has") {
    const types = hasTypeValuesStmt.all().map(row => row.value).filter(Boolean);
    return [...new Set(["notes", ...types])];
  }

  return [];
}

export function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ tags: [] });
  const isEdit = searchParams.get("is_edit") === "true";
  const colonIndex = q.indexOf(":");

  let suggestions = [];

  if (!isEdit) {
    if (colonIndex === -1) {
      const matchingOps = OPERATORS.filter(op => op.label.startsWith(q));

      suggestions.push(
        ...matchingOps.map(op => ({
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
      const operatorValues = getOperatorValues(operator);

      if (operatorValues.length) {
        const matchingValues = operatorValues.filter(v =>
          v.toLowerCase().startsWith(valuePart)
        );

        suggestions.push(
          ...matchingValues.map(v => ({
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
  const tagSuggestions = rows.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    postCount: r.post_count,
  }));

  return NextResponse.json({
    tags: [...suggestions, ...tagSuggestions],
  });
}
