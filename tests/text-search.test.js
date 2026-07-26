import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDb, destroyTempDb } from "./helpers/tempDb";

// Exercises the real Fuse matcher - @/lib/search is deliberately not mocked here.
describe("filename and text search", () => {
  let db;
  let tempDir;

  const FILES = [
    "Koreans+gaming_176287_11634726.mp4",
    "Ancient+woodcock_dcba35_9674726.jpg",
    "live_to_suffer.jpg",
    "the-more-you-know-awesome-creativity-Smooth.mp4",
    "Dream Evil - The Chosen Ones.mp3",
    "512.jpg",
    "512_wallpaper.jpg",
    "1638512999942.webm",
    "1679503391828488.webm",
    // Real timestamp-style names from the library. Fuzzy matching scores these 0.25
    // against "2026" despite containing no such digits, which is the noise the numeric
    // rule exists to prevent - without them this corpus cannot detect its absence.
    "1673544607220868.webm",
    "1638742064003.jpg",
  ];

  beforeEach(() => {
    vi.resetModules();
    ({ db, tempDir } = createTempDb("short-lib-text-search-"));
    vi.doMock("@/lib/db", () => ({ default: db }));

    const insert = db.prepare(`
      INSERT INTO media (file_path, created_at, checksum, original_filename, notes_md)
      VALUES (?, ?, ?, ?, ?)
    `);
    FILES.forEach((name, index) => {
      insert.run(`2026/03/${index}.bin`, 1000 + index, `sum${index}`, name, null);
    });
  });

  afterEach(() => {
    destroyTempDb({ db, tempDir });
  });

  async function filenameHits(query) {
    const { searchMediaIdsByFilename } = await import("@/lib/search");
    const ids = await searchMediaIdsByFilename(query);
    const byId = new Map(
      db.prepare(`SELECT id, original_filename AS name FROM media`).all()
        .map(row => [row.id, row.name])
    );
    return ids.map(id => byId.get(id));
  }

  it("finds a file by an exact word", async () => {
    expect(await filenameHits("woodcock")).toEqual(["Ancient+woodcock_dcba35_9674726.jpg"]);
  });

  it("tolerates a typo in a word", async () => {
    expect(await filenameHits("ancinet woodcock"))
      .toEqual(["Ancient+woodcock_dcba35_9674726.jpg"]);
    expect(await filenameHits("koreens gaming"))
      .toEqual(["Koreans+gaming_176287_11634726.mp4"]);
    expect(await filenameHits("dream evel")).toEqual(["Dream Evil - The Chosen Ones.mp3"]);
  });

  it("matches a space typed where the filename has a separator", async () => {
    expect(await filenameHits("koreans gaming"))
      .toEqual(["Koreans+gaming_176287_11634726.mp4"]);
    expect(await filenameHits("live to suffer")).toEqual(["live_to_suffer.jpg"]);
    expect(await filenameHits("the more you know"))
      .toEqual(["the-more-you-know-awesome-creativity-Smooth.mp4"]);
  });

  it("requires every term to match", async () => {
    expect(await filenameHits("woodcock gaming")).toEqual([]);
  });

  it("matches a numeric id exactly", async () => {
    expect(await filenameHits("176287")).toEqual(["Koreans+gaming_176287_11634726.mp4"]);
  });

  // Ranking used to fall back to insertion order, so an exact match could land anywhere.
  it("ranks an exact numeric match above one buried in a longer id", async () => {
    const hits = await filenameHits("512");

    expect(hits.length).toBeGreaterThan(1);
    expect(hits[0]).toBe("512.jpg");
  });

  // Exact beats mostly-the-match, which beats a fragment buried in a long id.
  it("ranks numeric matches by how much of the filename they cover", async () => {
    expect(await filenameHits("512")).toEqual([
      "512.jpg",
      "512_wallpaper.jpg",
      "1638512999942.webm",
    ]);
  });

  // The noise case: fuzzy digits matched files containing no such number at all.
  it("does not fuzzy-match a numeric term", async () => {
    expect(await filenameHits("2026")).toEqual([]);
    expect(await filenameHits("999999")).toEqual([]);
  });

  it("ignores the extension", async () => {
    expect(await filenameHits("mp4")).toEqual([]);
    expect(await filenameHits("jpg")).toEqual([]);
  });

  it("returns nothing for an empty query", async () => {
    expect(await filenameHits("")).toEqual([]);
    expect(await filenameHits("   ")).toEqual([]);
  });

  it("picks up a filename edited after the index was first built", async () => {
    const { searchMediaIdsByFilename, markMediaFilenamesIndexDirty } =
      await import("@/lib/search");

    expect(await searchMediaIdsByFilename("bicycle")).toEqual([]);

    db.prepare(`UPDATE media SET original_filename = ? WHERE checksum = ?`)
      .run("red_bicycle.jpg", "sum0");
    markMediaFilenamesIndexDirty();

    expect(await searchMediaIdsByFilename("bicycle")).toHaveLength(1);
  });

  describe("text:", () => {
    it("matches on either notes or filename", async () => {
      db.prepare(`UPDATE media SET notes_md = ? WHERE checksum = ?`)
        .run("office chair jousting", "sum5");

      const { searchMediaIdsByText, markMediaNotesIndexDirty } = await import("@/lib/search");
      markMediaNotesIndexDirty();

      const noteHit = await searchMediaIdsByText("jousting");
      const nameHit = await searchMediaIdsByText("woodcock");

      expect(noteHit).toHaveLength(1);
      expect(nameHit).toHaveLength(1);
      expect(noteHit).not.toEqual(nameHit);
    });

    // Splitting terms across fields would pair a real hit with an accidental one.
    it("does not let terms split across notes and filename", async () => {
      db.prepare(`UPDATE media SET notes_md = ? WHERE checksum = ?`)
        .run("jousting", "sum1");

      const { searchMediaIdsByText, markMediaNotesIndexDirty } = await import("@/lib/search");
      markMediaNotesIndexDirty();

      // "woodcock" is in that row's filename and "jousting" in its notes.
      expect(await searchMediaIdsByText("woodcock jousting")).toEqual([]);
    });

    // Concatenating the two rankings buried an exact filename match under loose note hits.
    it("ranks an exact filename match above a loose note match", async () => {
      db.prepare(`UPDATE media SET notes_md = ? WHERE checksum = ?`)
        .run("a note that loosely mentions 512 somewhere in its text", "sum0");

      const { searchMediaIdsByText, markMediaNotesIndexDirty } = await import("@/lib/search");
      markMediaNotesIndexDirty();

      const ids = await searchMediaIdsByText("512");
      const names = new Map(
        db.prepare(`SELECT id, original_filename AS name FROM media`).all()
          .map(row => [row.id, row.name])
      );

      expect(ids.length).toBeGreaterThan(1);
      expect(names.get(ids[0])).toBe("512.jpg");
    });

    it("de-duplicates a post matching in both fields", async () => {
      db.prepare(`UPDATE media SET notes_md = ? WHERE checksum = ?`)
        .run("woodcock", "sum1");

      const { searchMediaIdsByText, markMediaNotesIndexDirty } = await import("@/lib/search");
      markMediaNotesIndexDirty();

      expect(await searchMediaIdsByText("woodcock")).toHaveLength(1);
    });
  });
});
