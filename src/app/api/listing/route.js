import { NextResponse } from "next/server";
import { getPostsPage } from "@/app/listing/lib/getPosts";
import { getBlacklistedTags } from "@/lib/userSettings";

function parseIntParam(value, { min, max, fallback } = {}) {
  if (value == null || value === "") return fallback;

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

export function GET(req) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const offset = parseIntParam(searchParams.get("offset"), {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    fallback: 0,
  });
  const limit = parseIntParam(searchParams.get("limit"), {
    min: 1,
    max: 500,
    fallback: undefined,
  });

  if (offset == null || (searchParams.has("limit") && limit == null))
    return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const result = getPostsPage(search, {
    offset,
    limit,
    defaultExcludedTags: getBlacklistedTags(),
  });
  return NextResponse.json(result);
}
