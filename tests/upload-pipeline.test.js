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

  it("stores relative paths and adds a meta tag when type exists", async () => {
    vi.stubEnv("STORAGE_DIR", "C:\\storage");

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

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      transaction: vi.fn(fn => (...args) => fn(...args)),
    };

    vi.doMock("@/lib/db", () => ({ default: db }));
    vi.doMock("@/lib/addTags", () => ({ default: addTags }));

    const { default: addMediaToDb } = await import("../src/app/api/upload/addMediaToDb");

    const uploadDate = new Date("2026-03-08T10:00:00.000Z");
    const fileData = new Map([
      ["a", {
        filepath: "C:\\storage\\full\\2026\\03\\abc.jpg",
        uploadDate,
        size: 123,
        mimetype: "image/jpeg",
        dimensions: { width: 10, height: 20 },
        duration: null,
        originalFilename: "abc.jpg",
        variants: { thumb: "x" },
        checksum: "abc",
        type: "image",
      }],
      ["b", {
        filepath: "C:\\storage\\full\\2026\\03\\def.mp4",
        uploadDate,
        size: 999,
        mimetype: "video/mp4",
        dimensions: { width: 1920, height: 1080 },
        duration: 5000,
        originalFilename: "def.mp4",
        variants: null,
        checksum: "def",
        type: null,
      }],
    ]);

    await addMediaToDb(fileData);

    expect(inserted).toHaveLength(2);
    expect(inserted[0][0]).toBe("2026/03/abc.jpg");
    expect(inserted[0][8]).toBe(JSON.stringify({ thumb: "x" }));
    expect(inserted[1][8]).toBe("null");
    expect(addTags).toHaveBeenCalledTimes(1);
    expect(addTags).toHaveBeenCalledWith(201, [{ name: "image", type: "meta" }]);
  });
});
