import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  processImage: vi.fn(),
  processVideo: vi.fn(),
}));

vi.mock("../src/app/api/upload/processImage", () => ({
  default: hoisted.processImage,
}));

vi.mock("../src/app/api/upload/processVideo", () => ({
  default: hoisted.processVideo,
}));

describe("generateMediaDerivatives", () => {
  beforeEach(() => {
    hoisted.processImage.mockReset();
    hoisted.processVideo.mockReset();
  });

  it("routes image and video files to the proper processors", async () => {
    hoisted.processImage.mockResolvedValue({ thumb: "img-thumb" });
    hoisted.processVideo.mockResolvedValue({ thumb: "vid-thumb" });

    const { default: generateMediaDerivatives } = await import("../src/app/api/upload/generateMediaDerivatives");

    const image = { mimetype: "image/jpeg" };
    const video = { mimetype: "video/mp4" };
    const other = { mimetype: "application/pdf" };
    const fileData = new Map([["i", image], ["v", video], ["o", other]]);

    await generateMediaDerivatives(fileData);

    expect(hoisted.processImage).toHaveBeenCalledWith(image);
    expect(hoisted.processVideo).toHaveBeenCalledWith(video);
    expect(image.variants).toEqual({ thumb: "img-thumb" });
    expect(video.variants).toEqual({ thumb: "vid-thumb" });
    expect(other.variants).toBeUndefined();
  });
});

describe("addMediaToDb", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("stores relative paths, returns inserted media, and adds meta tags from upload metadata", async () => {
    const storageDir = path.resolve("storage");
    vi.stubEnv("STORAGE_DIR", storageDir);

    const inserted = [];
    const addTags = vi.fn();
    let nextId = 200;

    const db = {
      prepare: vi.fn(sql => {
        if (sql.includes("INSERT INTO media"))
          return {
            run: (...args) => {
              inserted.push(args);
              nextId += 1;
              return { lastInsertRowid: nextId };
            },
          };

        if (sql.includes("SELECT t.name, t.type"))
          return {
            all: mediaId => {
              if (mediaId === 201) return [{ name: "image", type: "meta" }];
              if (mediaId === 202) return [
                { name: "video", type: "meta" },
                { name: "has_audio", type: "meta" },
              ];
              return [];
            },
          };

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      transaction: vi.fn(fn => (...args) => fn(...args)),
    };

    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/addTags", () => ({ default: addTags }));
    vi.doMock("@/lib/userSettings", () => ({
      getTagTypeOrderSql: () => "CASE WHEN 'meta' THEN 0 ELSE 1 END",
    }));

    const { default: addMediaToDb } = await import("../src/app/api/upload/addMediaToDb");

    const uploadDate = new Date("2026-03-08T10:00:00.000Z");
    const fileData = new Map([
      ["a", {
        filepath: path.join(storageDir, "full", "2026", "03", "abc.jpg"),
        uploadDate,
        size: 123,
        mimetype: "image/jpeg",
        dimensions: { width: 10, height: 20 },
        duration: null,
        originalFilename: "abc.jpg",
        variants: { thumb: "x" },
        checksum: "abc",
        type: "image",
        hasAudio: false,
      }],
      ["b", {
        filepath: path.join(storageDir, "full", "2026", "03", "def.mp4"),
        uploadDate,
        size: 999,
        mimetype: "video/mp4",
        dimensions: { width: 1920, height: 1080 },
        duration: 5000,
        originalFilename: "def.mp4",
        variants: null,
        checksum: "def",
        type: "video",
        hasAudio: true,
      }],
    ]);

    const insertedMedia = await addMediaToDb(fileData);

    expect(inserted).toHaveLength(2);
    expect(inserted[0][0]).toBe("2026/03/abc.jpg");
    expect(inserted[0][8]).toBe(JSON.stringify({ thumb: "x" }));
    expect(inserted[1][8]).toBe("null");
    expect(insertedMedia).toEqual([
      {
        id: 201,
        originalFilename: "abc.jpg",
        filePath: "2026/03/abc.jpg",
        mimeType: "image/jpeg",
        tags: [{ name: "image", type: "meta" }],
      },
      {
        id: 202,
        originalFilename: "def.mp4",
        filePath: "2026/03/def.mp4",
        mimeType: "video/mp4",
        tags: [
          { name: "video", type: "meta" },
          { name: "has_audio", type: "meta" },
        ],
      },
    ]);
    expect(addTags).toHaveBeenCalledTimes(2);
    expect(addTags).toHaveBeenCalledWith(201, [{ name: "image", type: "meta" }]);
    expect(addTags).toHaveBeenCalledWith(202, [
      { name: "video", type: "meta" },
      { name: "has_audio", type: "meta" },
    ]);
  });
});

// The duplicate guard the upload route depends on: one query for the whole batch, and
// blanks never reach it.
describe("findExistingChecksums", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("de-duplicates parameters and returns the first usable match", async () => {
    const all = vi.fn(() => [
      { id: 1, checksum: "" },
      { id: 2, checksum: "abc" },
    ]);
    const db = { prepare: vi.fn(() => ({ all })) };
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { findExistingChecksums } = await import("@/lib/mediaChecksums");

    expect(findExistingChecksums(["abc", "abc", null, "def", ""]))
      .toEqual({ id: 2, checksum: "abc" });
    expect(all).toHaveBeenCalledWith("abc", "def");
    // Nothing usable to look up means no query at all.
    expect(findExistingChecksums([null, "", 123])).toBeUndefined();
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });
});
