import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import applySchema from "@/lib/schema";
import buildQuery from "../src/lib/listingQuery/buildQuery";
import parseSearch from "../src/lib/listingQuery/parseSearch";

const POST_COUNT = 50;

function libraryDb() {
  const db = new Database(":memory:");
  applySchema(db);
  const insert = db.prepare(`INSERT INTO media (file_path, created_at) VALUES (?, ?)`);
  for (let index = 0; index < POST_COUNT; index++) insert.run(`2026/01/${index}.jpg`, index);
  return db;
}

// Every page fetched the way the listing does it: same search and seed, growing offset.
function pagedIds(db, seed, pageSize = 8) {
  const parsed = parseSearch("order:random");
  const ids = [];
  for (let offset = 0; offset < POST_COUNT; offset += pageSize) {
    const { sql, params } = buildQuery(parsed, { limit: pageSize, offset, seed });
    ids.push(...db.prepare(sql).all(...params).map(row => row.id));
  }
  return ids;
}

describe("order:random", () => {
  it("is a setting, not a term", () => {
    const parsed = parseSearch("cat order:random");

    expect(parsed.filters.orderKey).toBe("random");
    expect(parsed.includeTags).toEqual(["cat"]);
  });

  it("pages through every post exactly once for one seed", () => {
    const ids = pagedIds(libraryDb(), 123456789);

    expect(ids).toHaveLength(POST_COUNT);
    expect(new Set(ids).size).toBe(POST_COUNT);
  });

  it("gives the same order for a seed and a different one for another", () => {
    const db = libraryDb();
    const first = pagedIds(db, 123456789);

    expect(pagedIds(db, 123456789)).toEqual(first);
    expect(pagedIds(db, 1987654321)).not.toEqual(first);
    // Not just the insertion order in disguise.
    expect(first).not.toEqual([...first].sort((left, right) => left - right));
  });

  it("falls back to a fixed seed rather than inlining anything else", () => {
    const parsed = parseSearch("order:random");

    expect(buildQuery(parsed, { seed: "1; DROP TABLE media" }).sql)
      .toEqual(buildQuery(parsed, { seed: 0 }).sql);
  });
});
