import { beforeEach, describe, expect, it, vi } from "vitest";

import buildQuery from "../src/lib/listingQuery/buildQuery";
import parseSearch from "../src/lib/listingQuery/parseSearch";
import { findTerm, findTerms, simplify } from "./helpers/searchTerms";

describe("search parser and query builder", () => {
  it("ignores extra whitespace and keeps include/exclude tags", () => {
    const parsed = parseSearch("   tag1   -tag2   tag3  ");

    expect(parsed.includeTags).toEqual(["tag1", "tag3"]);
    expect(parsed.excludeTags).toEqual(["tag2"]);
  });

  it("supports quoted tokens with spaces", () => {
    const parsed = parseSearch("tag1 \"tag two\" -\"tag three\"");

    expect(parsed.includeTags).toEqual(["tag1", "tag two"]);
    expect(parsed.excludeTags).toEqual(["tag three"]);
  });

  it("supports escaped quotes inside quoted tokens", () => {
    const parsed = parseSearch("\"say \\\"hello\\\"\" -\"quote: \\\"x\\\"\"");

    expect(parsed.includeTags).toEqual(["say \"hello\""]);
    expect(parsed.excludeTags).toEqual(["quote: \"x\""]);
  });

  it("applies default excluded tags unless query already mentions them", () => {
    const parsed = parseSearch("cat -bird", {
      defaultExcludedTags: ["nsfw", "cat", "bird", "nsfw"],
    });

    expect(parsed.includeTags).toEqual(["cat"]);
    expect(parsed.excludeTags).toEqual(["bird", "nsfw"]);
  });

  it("allows explicit include tags to override blacklist defaults", () => {
    const parsed = parseSearch("nsfw", {
      defaultExcludedTags: ["nsfw", "spoiler"],
    });

    expect(parsed.includeTags).toEqual(["nsfw"]);
    expect(parsed.excludeTags).toEqual(["spoiler"]);
  });

  it("keeps default limit when limit token is malformed", () => {
    expect(parseSearch("limit:abc").filters.limit).toBe(100);
    expect(parseSearch("limit:").filters.limit).toBe(100);
  });

  it("builds SQL with boolean tag predicates", () => {
    const { sql, params } = buildQuery(parseSearch("cat dog -bird -fish limit:25"));

    expect(params).toEqual(["cat", "dog", "bird", "fish"]);
    expect(sql).toContain("EXISTS (");
    expect(sql).toMatch(/NOT\s+EXISTS/);
    expect(sql).toContain("LIMIT 25");
    expect(sql).toContain("OFFSET 0");
  });

  it("supports OR with parentheses and implicit AND", () => {
    const parsed = parseSearch("(raven OR owl) plague_doctor");
    const { sql, params } = buildQuery(parsed);

    expect(simplify(parsed.expression)).toEqual([
      "AND",
      ["OR", "raven", "owl"],
      "plague_doctor",
    ]);
    expect(sql).toContain(" OR ");
    expect(sql).toContain(" AND ");
    expect(params).toEqual(["raven", "owl", "plague_doctor"]);
  });

  it("keeps AND precedence higher than OR without parentheses", () => {
    const parsed = parseSearch("raven OR owl plague_doctor");

    expect(simplify(parsed.expression)).toEqual([
      "OR",
      "raven",
      ["AND", "owl", "plague_doctor"],
    ]);
  });

  // The reported bug: operators bypassed the expression tree and were AND-ed in
  // afterwards, so the OR silently became an AND and the dangling operand was dropped.
  it("lets an operator sit on either side of an OR", () => {
    expect(simplify(parseSearch("fish OR notes:\"fish\"").expression))
      .toEqual(["OR", "fish", "notes:"]);
    expect(simplify(parseSearch("notes:\"fish\" OR fish").expression))
      .toEqual(["OR", "notes:", "fish"]);
    expect(simplify(parseSearch("score:5 OR file_size:>1mb").expression))
      .toEqual(["OR", "score:", "file_size:"]);
  });

  it("emits OR in the SQL for an operator alternative", () => {
    const { sql } = buildQuery(parseSearch("cat OR score:5"));
    const flat = sql.replace(/\s+/g, " ");

    expect(flat).toContain(") OR COALESCE(m.score, 0) = ?)");
  });

  it("groups operators with parentheses", () => {
    expect(simplify(parseSearch("(score:5 OR score:4) cat").expression))
      .toEqual(["AND", ["OR", "score:", "score:"], "cat"]);
  });

  it("keeps AND precedence over OR across operators", () => {
    expect(simplify(parseSearch("cat OR score:5 dog").expression))
      .toEqual(["OR", "cat", ["AND", "score:", "dog"]]);
  });

  // Negation used to work only for -has:, so -score:5 became a tag search for "score:5".
  it("negates any operator, not just has:", () => {
    const parsed = parseSearch("-score:5 -mime_type:video/mp4 -duration:>60s");
    const terms = findTerms(parsed.expression);

    expect(terms.map(term => term.kind))
      .toEqual(["score", "mime_type", "duration"]);
    expect(terms.every(term => term.negated)).toBe(true);
    expect(parsed.includeTags).toEqual([]);
  });

  // NULL comparisons are NULL, and NOT NULL is still NULL, which would drop rows that have
  // no value at all instead of including them.
  it("makes a negated comparison total over missing values", () => {
    const { sql } = buildQuery(parseSearch("-duration:>60s"));

    expect(sql).toContain("NOT COALESCE(m.duration_ms > ?, 0)");
  });

  it("negates a resolved id search into its complement", () => {
    const parsed = parseSearch("-notes:cat");
    findTerm(parsed, "notes").mediaIds = [4, 6];

    expect(buildQuery(parsed).sql).toMatch(/NOT m\.id IN \(\?, \?\)/);
  });

  // An unmatched positive term matches nothing; negated, it must match everything rather
  // than collapsing the query.
  it("treats an unresolved negated search as matching everything", () => {
    expect(buildQuery(parseSearch("-notes:cat")).sql).toContain("1 = 1");
    expect(buildQuery(parseSearch("notes:cat")).sql).toContain("1 = 0");
  });

  it("supports explicit limit/offset pagination overrides", () => {
    const { sql } = buildQuery(parseSearch("cat limit:25"), { limit: 10, offset: 40 });

    expect(sql).toContain("LIMIT 10");
    expect(sql).toContain("OFFSET 40");
  });

  it("parses operator filters and applies them to SQL", () => {
    const parsed = parseSearch(
      "mime_type:video/mp4 file_size:>10mb age:<7d mpixels:>=2 duration:<90s image_ratio:16/9 order:pixelcount"
    );
    const { sql, params } = buildQuery(parsed);

    expect(parsed.filters.orderBy).toContain("COALESCE(m.width, 0) * COALESCE(m.height, 0)");
    expect(findTerm(parsed, "mime_type").value).toBe("video/mp4");
    expect(findTerm(parsed, "file_size").comparison).toEqual({ op: ">", value: 10485760 });
    expect(findTerm(parsed, "age").comparison).toEqual({ op: "<", value: 604800 });
    expect(findTerm(parsed, "mpixels").comparison).toEqual({ op: ">=", value: 2000000 });
    expect(findTerm(parsed, "duration").comparison).toEqual({ op: "<", value: 90000 });
    expect(findTerm(parsed, "image_ratio").comparison).toEqual({ op: "=", value: 16 / 9 });

    expect(sql).toContain("LOWER(m.mime_type) = ?");
    expect(sql).toContain("m.file_size > ?");
    expect(sql).toContain("m.duration_ms < ?");
    expect(sql).toContain("CAST(m.width AS REAL) / m.height");
    expect(sql).toContain("ORDER BY (COALESCE(m.width, 0) * COALESCE(m.height, 0)) DESC");
    expect(params).toEqual(["video/mp4", 10485760, 604800, 2000000, 90000, 16 / 9]);
  });

  // Repeating an operator now yields separate terms, AND-ed like any other pair, rather
  // than being merged into one query string.
  it("makes each filename token its own term", () => {
    const parsed = parseSearch("filename:\"koreans gaming\" filename:mp4");

    expect(simplify(parsed.expression))
      .toEqual(["AND", "filename:", "filename:"]);
    expect(findTerms(parsed.expression, "filename").map(term => term.query))
      .toEqual(["koreans gaming", "mp4"]);
  });

  it("keeps notes, text and filename as independent terms", () => {
    const parsed = parseSearch("notes:a text:b filename:c");

    expect(findTerm(parsed, "notes").query).toBe("a");
    expect(findTerm(parsed, "text").query).toBe("b");
    expect(findTerm(parsed, "filename").query).toBe("c");
  });

  it("adds an id clause for a resolved filename search", () => {
    const parsed = parseSearch("filename:cat");
    findTerm(parsed, "filename").mediaIds = [4, 6];
    const { sql, params } = buildQuery(parsed);

    expect(sql).toContain("m.id IN (?, ?)");
    expect(params).toEqual([4, 6]);
  });

  it("orders by relevance when ranked ids are supplied", () => {
    const parsed = parseSearch("filename:cat");
    findTerm(parsed, "filename").mediaIds = [9, 3];
    const { sql } = buildQuery(parsed, { relevanceIds: [9, 3] });

    expect(sql).toContain("CASE m.id WHEN 9 THEN 0 WHEN 3 THEN 1 ELSE 2 END");
    // The requested order still breaks ties and covers rows past the ranked cap.
    expect(sql).toContain("ELSE 2 END, m.created_at DESC");
  });

  it("keeps the plain order when no ranked ids are supplied", () => {
    const { sql } = buildQuery(parseSearch("cat"));

    expect(sql).not.toContain("CASE m.id");
    expect(sql).toContain("ORDER BY m.created_at DESC");
  });

  it("ignores unusable ranked ids", () => {
    const parsed = parseSearch("filename:cat");

    expect(buildQuery(parsed, { relevanceIds: [] }).sql).not.toContain("CASE m.id");
    expect(buildQuery(parsed, { relevanceIds: null }).sql).not.toContain("CASE m.id");
    expect(buildQuery(parsed, { relevanceIds: [0, -2, 1.5, "7"] }).sql)
      .not.toContain("CASE m.id");
  });

  it("caps how many ranked ids reach the statement", () => {
    const parsed = parseSearch("filename:cat");
    const manyIds = Array.from({ length: 900 }, (_, index) => index + 1);
    const { sql } = buildQuery(parsed, { relevanceIds: manyIds });

    expect(sql).toContain("WHEN 500 THEN 499");
    expect(sql).not.toContain("WHEN 501 THEN 500");
    expect(sql).toContain("ELSE 500 END");
  });

  it("parses a quoted notes phrase into one term", () => {
    const parsed = parseSearch("notes:\"hello world\" notes:cat");
    expect(findTerms(parsed.expression, "notes").map(t => t.query))
      .toEqual(["hello world", "cat"]);
  });

  it("adds notes id clause when notes matches are pre-resolved", () => {
    const parsed = parseSearch("notes:\"hello world\"");
    findTerm(parsed, "notes").mediaIds = [7, 9];
    const { sql, params } = buildQuery(parsed);

    expect(sql).toContain("m.id IN (?, ?)");
    expect(sql).not.toContain("media_notes_fts");
    expect(params).toEqual([7, 9]);
  });

  it("forces empty result when notes query has no resolved ids", () => {
    const parsed = parseSearch("notes:\"hello world\"");
    const { sql, params } = buildQuery(parsed);

    expect(sql).toContain("1 = 0");
    expect(params).toEqual([]);
  });

  it("parses has operators into normalized terms", () => {
    const parsed = parseSearch("has:notes -has:character has:creator");

    expect(findTerms(parsed.expression, "has").map(({ value, negated }) => ({ value, negated })))
      .toEqual([
        { value: "notes", negated: false },
        { value: "character", negated: true },
        { value: "creator", negated: false },
      ]);
  });

  it("adds has predicates and tag-type params to SQL", () => {
    const parsed = parseSearch("has:notes -has:character has:creator");
    const { sql, params } = buildQuery(parsed);

    expect(sql).toContain("COALESCE(TRIM(m.notes_md), '') <> ''");
    expect(sql).toContain("NOT");
    expect(sql).toContain("LOWER(t.type) = ?");
    expect(params).toEqual(["character", "creator"]);
  });

  it("ignores malformed operator tokens", () => {
    const parsed = parseSearch("file_size:abc age:-- order:nope mpixels:x duration:- image_ratio:1/0 has: -has: tag1");

    expect(parsed.includeTags).toEqual(["tag1"]);
    // A malformed operator contributes no term at all, leaving only the tag.
    expect(simplify(parsed.expression)).toBe("tag1");
    expect(parsed.filters.orderBy).toBe("m.created_at DESC");
  });

  it("supports additional order modes", () => {
    expect(parseSearch("order:image_ratio").filters.orderBy).toContain("CAST(m.width AS REAL) / m.height");
    expect(parseSearch("order:tag_count").filters.orderBy).toBe("tag_count DESC");
    expect(parseSearch("order:file_size_asc").filters.orderBy).toBe("m.file_size ASC");
    expect(parseSearch("order:age_desc").filters.orderBy).toBe("m.created_at DESC");
  });
});

describe("getPosts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("parses JSON fields with safe fallbacks", async () => {
    const fakeRows = [
      {
        id: 1,
        variants: null,
        tags: '[{"id":1,"name":"tag1"}]',
      },
      {
        id: 2,
        variants: "{bad json",
        tags: null,
      },
    ];

    const db = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => fakeRows),
      })),
    };

    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({
      searchMediaMatchesByNotes: vi.fn(async () => []),
      searchMediaMatchesByText: vi.fn(async () => []),
      searchMediaMatchesByFilename: vi.fn(async () => [].map(id => ({ mediaId: id, score: 0, field: "filename", range: null }))),
    }));
    vi.doMock("@/lib/tagAliases", () => ({
      resolveTagName: vi.fn(name => name),
    }));

    const { default: getPosts } = await import("../src/lib/listingQuery/getPosts");
    const posts = await getPosts("tag1");

    expect(posts[0].variants).toBeNull();
    expect(posts[0].tags).toEqual([{ id: 1, name: "tag1" }]);
    expect(posts[1].variants).toBeNull();
    expect(posts[1].tags).toEqual([]);
  });

  it("returns paginated rows with hasMore metadata", async () => {
    const fakeRows = [
      { id: 1, variants: null, tags: "[]" },
      { id: 2, variants: null, tags: "[]" },
      { id: 3, variants: null, tags: "[]" },
    ];

    const db = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => fakeRows),
      })),
    };

    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({
      searchMediaMatchesByNotes: vi.fn(async () => []),
      searchMediaMatchesByText: vi.fn(async () => []),
      searchMediaMatchesByFilename: vi.fn(async () => [].map(id => ({ mediaId: id, score: 0, field: "filename", range: null }))),
    }));
    vi.doMock("@/lib/tagAliases", () => ({
      resolveTagName: vi.fn(name => name),
    }));

    const { getPostsPage } = await import("../src/lib/listingQuery/getPosts");
    const page = await getPostsPage("", { limit: 2, offset: 0 });

    expect(page.posts.map(post => post.id)).toEqual([1, 2]);
    expect(page.hasMore).toBe(true);
    expect(page.nextOffset).toBe(2);
    expect(page.subtitleKinds).toEqual([]);
  });

  it("reports which metadata filter drives the subtitle", async () => {
    const db = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => [{ id: 1, variants: null, tags: "[]" }]),
      })),
    };

    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({
      searchMediaMatchesByNotes: vi.fn(async () => []),
      searchMediaMatchesByText: vi.fn(async () => []),
      searchMediaMatchesByFilename: vi.fn(async () => [].map(id => ({ mediaId: id, score: 0, field: "filename", range: null }))),
    }));
    vi.doMock("@/lib/tagAliases", () => ({
      resolveTagName: vi.fn(name => name),
    }));

    const { getPostsPage } = await import("../src/lib/listingQuery/getPosts");

    expect((await getPostsPage("file_size:>1mb")).subtitleKinds).toEqual(["file_size"]);
    expect((await getPostsPage("cat")).subtitleKinds).toEqual([]);
  });

  // The notes bail-out returns before the query runs, and must still report the kind.
  it("reports the subtitle kind when a notes search matches nothing", async () => {
    const db = { prepare: vi.fn(() => ({ all: vi.fn(() => []) })) };

    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({
      searchMediaMatchesByNotes: vi.fn(async () => []),
      searchMediaMatchesByText: vi.fn(async () => []),
      searchMediaMatchesByFilename: vi.fn(async () => [].map(id => ({ mediaId: id, score: 0, field: "filename", range: null }))),
    }));
    vi.doMock("@/lib/tagAliases", () => ({
      resolveTagName: vi.fn(name => name),
    }));

    const { getPostsPage } = await import("../src/lib/listingQuery/getPosts");
    const page = await getPostsPage("notes:nothing file_size:>1mb");

    expect(page.posts).toEqual([]);
    expect(page.subtitleKinds).toEqual(["file_size"]);
  });

  it("surfaces a failing listing query instead of returning an empty page", async () => {
    const db = {
      prepare: vi.fn(() => {
        throw new Error("no such column: m.bogus");
      }),
    };

    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({
      searchMediaMatchesByNotes: vi.fn(async () => []),
      searchMediaMatchesByText: vi.fn(async () => []),
      searchMediaMatchesByFilename: vi.fn(async () => [].map(id => ({ mediaId: id, score: 0, field: "filename", range: null }))),
    }));
    vi.doMock("@/lib/tagAliases", () => ({
      resolveTagName: vi.fn(name => name),
    }));

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => { });
    const { getPostsPage } = await import("../src/lib/listingQuery/getPosts");

    await expect(getPostsPage("cat")).rejects.toThrow("no such column: m.bogus");
    expect(consoleError).toHaveBeenCalledOnce();

    consoleError.mockRestore();
  });

  it("orders a fuzzy search by relevance, but yields to an explicit order", async () => {
    const prepared = [];
    const db = {
      prepare: vi.fn(sql => {
        prepared.push(sql);
        return { all: vi.fn(() => []) };
      }),
    };

    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({
      searchMediaMatchesByNotes: vi.fn(async () => []),
      searchMediaMatchesByText: vi.fn(async () => []),
      searchMediaMatchesByFilename: vi.fn(async () => [9, 3].map(id => ({ mediaId: id, score: 0, field: "filename", range: null }))),
    }));
    vi.doMock("@/lib/tagAliases", () => ({
      resolveTagName: vi.fn(name => name),
    }));

    const { getPostsPage } = await import("../src/lib/listingQuery/getPosts");

    await getPostsPage("filename:cat");
    expect(prepared.at(-1)).toContain("CASE m.id WHEN 9 THEN 0 WHEN 3 THEN 1");

    await getPostsPage("filename:cat order:file_size");
    expect(prepared.at(-1)).not.toContain("CASE m.id");
    expect(prepared.at(-1)).toContain("ORDER BY m.file_size DESC");
  });

  it("leaves a non-fuzzy search on its normal order", async () => {
    const prepared = [];
    const db = {
      prepare: vi.fn(sql => {
        prepared.push(sql);
        return { all: vi.fn(() => []) };
      }),
    };

    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/search", () => ({
      searchMediaMatchesByNotes: vi.fn(async () => []),
      searchMediaMatchesByText: vi.fn(async () => []),
      searchMediaMatchesByFilename: vi.fn(async () => [9, 3].map(id => ({ mediaId: id, score: 0, field: "filename", range: null }))),
    }));
    vi.doMock("@/lib/tagAliases", () => ({
      resolveTagName: vi.fn(name => name),
    }));

    const { getPostsPage } = await import("../src/lib/listingQuery/getPosts");
    await getPostsPage("cat");

    expect(prepared.at(-1)).not.toContain("CASE m.id");
  });
});
