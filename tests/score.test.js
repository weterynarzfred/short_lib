import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clampScore, MAX_SCORE } from "@/lib/score";
import parseSearch from "@/lib/listingQuery/parseSearch";
import buildQuery from "@/lib/listingQuery/buildQuery";
import getSubtitleKinds from "@/lib/listingQuery/subtitleKinds";
import getPostSubtitles from "@/app/listing/lib/postSubtitle";
import { createTempDb, destroyTempDb } from "./helpers/tempDb";
import { findTerm } from "./helpers/searchTerms";

describe("clampScore", () => {
  it("keeps whole scores in range", () => {
    expect(clampScore(0)).toBe(0);
    expect(clampScore(3)).toBe(3);
    expect(clampScore(MAX_SCORE)).toBe(MAX_SCORE);
  });

  it("clamps out-of-range values", () => {
    expect(clampScore(-4)).toBe(0);
    expect(clampScore(99)).toBe(MAX_SCORE);
  });

  it("rounds fractions and treats junk as unrated", () => {
    expect(clampScore(2.4)).toBe(2);
    expect(clampScore(2.6)).toBe(3);
    expect(clampScore("abc")).toBe(0);
    expect(clampScore(null)).toBe(0);
    expect(clampScore(undefined)).toBe(0);
  });
});

describe("score search", () => {
  const scoreTerm = search => findTerm(parseSearch(search), "score");

  it("parses comparisons", () => {
    expect(scoreTerm("score:>=4").comparison).toEqual({ op: ">=", value: 4 });
    expect(scoreTerm("score:5").comparison).toEqual({ op: "=", value: 5 });
    expect(scoreTerm("score:<2").comparison).toEqual({ op: "<", value: 2 });
  });

  it("ignores a fractional or malformed score", () => {
    expect(scoreTerm("score:3.5")).toBeNull();
    expect(scoreTerm("score:abc")).toBeNull();
    expect(scoreTerm("score:")).toBeNull();
  });

  it("builds a score predicate", () => {
    const { sql, params } = buildQuery(parseSearch("score:>=4"));

    expect(sql).toContain("COALESCE(m.score, 0) >= ?");
    expect(params).toEqual([4]);
  });

  // 0 and unrated are the same thing, so -has:score must mean "score is zero".
  it("maps has:score onto the zero boundary", () => {
    expect(buildQuery(parseSearch("has:score")).sql).toContain("COALESCE(m.score, 0) > 0");
    expect(buildQuery(parseSearch("-has:score")).sql).toContain("COALESCE(m.score, 0) = 0");
  });

  it("supports ordering by score in both directions", () => {
    expect(parseSearch("order:score").filters.orderBy).toBe("m.score DESC");
    expect(parseSearch("order:score_asc").filters.orderBy).toBe("m.score ASC");
    expect(parseSearch("order:score").filters.orderKey).toBe("score");
  });
});

describe("score subtitle", () => {
  it("is driven by a score filter or an explicit score order", () => {
    expect(getSubtitleKinds(parseSearch("score:>=4"))).toEqual(["score"]);
    expect(getSubtitleKinds(parseSearch("order:score"))).toEqual(["score"]);
    expect(getSubtitleKinds(parseSearch("cat"))).toEqual([]);
  });

  it("is driven by has:score, which asks for rated posts", () => {
    expect(getSubtitleKinds(parseSearch("has:score"))).toEqual(["score"]);
  });

  // -has:score selects unrated posts, which have no stars to show.
  it("is not driven by a negated has:score", () => {
    expect(getSubtitleKinds(parseSearch("-has:score"))).toEqual([]);
    expect(getSubtitleKinds(parseSearch("has:notes"))).toEqual([]);
  });

  it("renders one star per point", () => {
    expect(getPostSubtitles({ score: 3 }, ["score"])[0].text).toBe("★★★");
    expect(getPostSubtitles({ score: 5 }, ["score"])[0].text).toBe("★★★★★");
    expect(getPostSubtitles({ score: 1 }, ["score"])[0].text).toBe("★");
  });

  it("renders nothing for an unrated post", () => {
    expect(getPostSubtitles({ score: 0 }, ["score"])).toEqual([]);
    expect(getPostSubtitles({ score: null }, ["score"])).toEqual([]);
    expect(getPostSubtitles({}, ["score"])).toEqual([]);
  });

  it("never renders more stars than the maximum", () => {
    expect(getPostSubtitles({ score: 99 }, ["score"])[0].text).toHaveLength(MAX_SCORE);
  });

  it("leads the line order when combined with other kinds", () => {
    expect(getSubtitleKinds(parseSearch("score:>=4 file_size:>1mb")))
      .toEqual(["score", "file_size"]);
  });
});

describe("score persistence", () => {
  let db;
  let tempDir;

  beforeEach(() => {
    vi.resetModules();
    ({ db, tempDir } = createTempDb("short-lib-score-"));
    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("@/lib/search", () => ({
      markMediaNotesIndexDirty: vi.fn(),
      markMediaFilenamesIndexDirty: vi.fn(),
    }));
  });

  afterEach(() => {
    destroyTempDb({ db, tempDir });
  });

  function addMedia(checksum) {
    return db.prepare(`
      INSERT INTO media (file_path, created_at, checksum) VALUES (?, ?, ?)
    `).run(`2026/03/${checksum}.jpg`, 1000, checksum).lastInsertRowid;
  }

  const scoreOf = id => db.prepare(`SELECT score FROM media WHERE id = ?`).get(id).score;

  it("defaults a new row to unrated", () => {
    expect(scoreOf(addMedia("a"))).toBe(0);
  });

  it("stores a clamped score", async () => {
    const id = addMedia("a");
    const { updatePostScoreAction } = await import("@/lib/actions");

    expect(await updatePostScoreAction(id, 4)).toEqual({ score: 4 });
    expect(scoreOf(id)).toBe(4);

    expect(await updatePostScoreAction(id, 99)).toEqual({ score: 5 });
    expect(scoreOf(id)).toBe(5);

    expect(await updatePostScoreAction(id, 0)).toEqual({ score: 0 });
    expect(scoreOf(id)).toBe(0);
  });

  it("rejects an invalid media id", async () => {
    const { updatePostScoreAction } = await import("@/lib/actions");
    await expect(updatePostScoreAction(0, 3)).rejects.toThrow("Invalid media id");
  });

  it("sets every selected post in bulk", async () => {
    const first = addMedia("a");
    const second = addMedia("b");
    const untouched = addMedia("c");

    const { updatePostScoreBulkAction } = await import("@/lib/actions");
    const result = await updatePostScoreBulkAction([first, second], 5);

    expect(result).toEqual({ score: 5, postIds: [first, second] });
    expect(scoreOf(first)).toBe(5);
    expect(scoreOf(second)).toBe(5);
    expect(scoreOf(untouched)).toBe(0);
  });

  it("ignores non-integer ids in bulk and handles an empty selection", async () => {
    const id = addMedia("a");
    const { updatePostScoreBulkAction } = await import("@/lib/actions");

    await updatePostScoreBulkAction([id, "x", -2, null], 2);
    expect(scoreOf(id)).toBe(2);

    expect(await updatePostScoreBulkAction([], 3)).toEqual({ score: 3, postIds: [] });
  });

  it("filters by score through the query", async () => {
    const low = addMedia("a");
    const high = addMedia("b");

    const { updatePostScoreBulkAction } = await import("@/lib/actions");
    await updatePostScoreBulkAction([low], 2);
    await updatePostScoreBulkAction([high], 5);

    const runSearch = search => {
      const { sql, params } = buildQuery(parseSearch(search));
      return db.prepare(sql).all(...params).map(row => row.id);
    };

    expect(runSearch("score:>=4")).toEqual([high]);
    expect(runSearch("score:2")).toEqual([low]);
    expect(runSearch("has:score").sort()).toEqual([low, high].sort());
    expect(runSearch("-has:score")).toEqual([]);
  });
});
