import { NextResponse } from "next/server";
import db from "@/lib/db";
import { ORDER_KEYS } from "@/lib/listingQuery/parseSearch";
import { searchTagSuggestions } from "@/lib/tagSuggestions";

const OPERATORS = [
  {
    key: "mime_type",
    // `hasValues` is declared rather than derived: the dynamic lists come from the
    // database, and asking for them on every keystroke just to learn whether they are
    // non-empty would cost a query per suggestion.
    hasValues: true,
  },
  {
    key: "file_size",
  },
  {
    key: "order",
    hasValues: true,
    values: ORDER_KEYS,
  },
  {
    key: "age",
  },
  {
    key: "mpixels",
  },
  {
    key: "score",
  },
  {
    key: "duration",
  },
  {
    key: "notes",
    // Takes free text rather than a value from a list, so accepting it opens a quoted
    // phrase for the caret to land inside.
    quoted: true,
  },
  {
    key: "text",
    quoted: true,
  },
  {
    key: "filename",
    quoted: true,
  },
  {
    key: "has",
    hasValues: true,
  },
  {
    key: "similar",
  },
  {
    key: "image_ratio",
  },
  {
    key: "limit",
  },
];

const mimeTypeValuesStmt = db.prepare(`
  SELECT
    LOWER(TRIM(m.mime_type)) AS value
  FROM media m
  WHERE TRIM(COALESCE(m.mime_type, '')) <> ''
  GROUP BY LOWER(TRIM(m.mime_type))
  ORDER BY COUNT(*) DESC, value ASC
  LIMIT 32
`);

// Types are stored trimmed and lowercased, and never empty, so they group as they are.
const hasTypeValuesStmt = db.prepare(`
  SELECT t.type AS value
  FROM tags t
  GROUP BY t.type
  ORDER BY COUNT(*) DESC, value ASC
  LIMIT 32
`);

function getOperatorValues(operator) {
  if (!operator) return [];

  if (operator.values) return operator.values;

  if (operator.key === "mime_type")
    return mimeTypeValuesStmt.all().map(row => row.value);

  if (operator.key === "has") {
    const types = hasTypeValuesStmt.all().map(row => row.value);
    return [...new Set(["notes", "score", ...types])];
  }

  return [];
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ tags: [] });
  const isEdit = searchParams.get("is_edit") === "true";
  const colonIndex = q.indexOf(":");

  const suggestions = [];

  if (!isEdit) {
    if (colonIndex === -1) {
      const matchingOps = OPERATORS.filter(op => `${op.key}:`.startsWith(q));

      suggestions.push(
        ...matchingOps.map(op => ({
          id: `op_${op.key}`,
          name: `${op.key}:`,
          type: "operator",
          postCount: null,
          quoted: op.quoted === true,
          // Lets the editor open the value list straight after the operator is accepted.
          // Operators without one fall through to a tag search, which returns noise.
          hasValues: op.hasValues === true,
        }))
      );
    } else {
      const valuePart = q.slice(colonIndex + 1);
      const operator = OPERATORS.find(op => op.key === q.slice(0, colonIndex));
      const operatorValues = getOperatorValues(operator);

      if (operatorValues.length) {
        const matchingValues = operatorValues.filter(v =>
          v.toLowerCase().startsWith(valuePart)
        );

        suggestions.push(
          ...matchingValues.map(v => ({
            id: `op_${operator.key}_${v}`,
            name: `${operator.key}:${v}`,
            type: "value",
            postCount: null,
          }))
        );

        return NextResponse.json({ tags: suggestions });
      }
    }
  }

  const tagSuggestions = await searchTagSuggestions(q, { limit: 16 });

  return NextResponse.json({
    tags: [...suggestions, ...tagSuggestions],
  });
}
