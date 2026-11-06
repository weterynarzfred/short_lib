import { NextResponse } from "next/server";
import { getPostsPage } from "@/lib/listingQuery/getPosts";
import { MAX_RANDOM_SEED } from "@/lib/listingQuery/buildQuery";
import { getBlacklistedTags, getTagTypeOrderSql } from "@/lib/userSettings";

function parseIntParam(value, { min, max, fallback }) {
  if (value == null || value === "") return fallback;

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

export async function GET(req) {
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
  // The seed the first page was rendered with, so `order:random` continues the same shuffle.
  const seed = parseIntParam(searchParams.get("seed"), {
    min: 0,
    max: MAX_RANDOM_SEED - 1,
    fallback: 0,
  });

  if (offset == null || seed == null || (searchParams.has("limit") && limit == null))
    return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const result = await getPostsPage(search, {
    offset,
    limit,
    defaultExcludedTags: getBlacklistedTags(),
    tagOrderSql: getTagTypeOrderSql(),
    seed,
  });
  return NextResponse.json(result);
}