import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ rows: [] }));

vi.mock("@/lib/db", () => ({
  default: {
    prepare: sql => sql.includes("WHERE id = ?")
      ? { get: id => hoisted.rows.find(row => row.id === id) }
      : { all: id => hoisted.rows.filter(row => row.id !== id && row.phash.length) },
  },
}));

// Frames far apart from each other, so only a deliberate near-copy can match.
const FRAMES = {
  a: "0000000000000000",
  b: "ffffffff00000000",
  c: "00000000ffffffff",
  d: "f0f0f0f0f0f0f0f0",
  e: "0f0f0f0f0f0f0f0f",
  // `b` with two bits flipped: a re-encoded frame.
  bNear: "fffffffc00000000",
  // `e` with four and eight bits flipped: a close copy and a merely similar picture.
  eClose: "0f0f0f0f0f0f0f00",
  eFar: "0f0f0f0f0f0f0000",
};

const hash = (...frames) => Buffer.from(frames.map(frame => FRAMES[frame]).join(""), "hex");

describe("findSimilarMedia", () => {
  beforeEach(() => {
    vi.resetModules();
    hoisted.rows = [
      { id: 1, phash: hash("a", "b", "c", "d") }, // the source video
      { id: 2, phash: hash("bNear", "c") }, // a clip cut from it
      { id: 3, phash: hash("c") }, // a screenshot of it
      { id: 4, phash: hash("e") }, // an image
      { id: 5, phash: hash("eClose") }, // a recompressed copy of it
      { id: 6, phash: hash("eFar") }, // something that only looks a bit like it
      { id: 7, phash: hash("a", "e") }, // shares one frame with the source, nothing more
      { id: 8, phash: Buffer.alloc(0) }, // hashed, nothing usable
    ];
  });

  it("matches a clip and its source, with the post itself first", async () => {
    const { default: findSimilarMedia } = await import("../src/lib/similarity");

    expect(findSimilarMedia(2).map(row => row.mediaId)).toEqual([2, 1]);
    expect(findSimilarMedia(1).map(row => row.mediaId)).toEqual([1, 2]);
  });

  it("matches a close copy of an image and nothing looser", async () => {
    const { default: findSimilarMedia } = await import("../src/lib/similarity");

    expect(findSimilarMedia(4).map(row => row.mediaId)).toEqual([4, 5]);
  });

  it("never matches a single frame against a multi-frame video", async () => {
    const { default: findSimilarMedia } = await import("../src/lib/similarity");

    expect(findSimilarMedia(3).map(row => row.mediaId)).toEqual([3]);
  });

  it("needs more than one matching frame between videos", async () => {
    const { default: findSimilarMedia } = await import("../src/lib/similarity");

    expect(findSimilarMedia(7).map(row => row.mediaId)).toEqual([7]);
  });

  it("finds only the post itself when it hashed to nothing", async () => {
    const { default: findSimilarMedia } = await import("../src/lib/similarity");

    expect(findSimilarMedia(8).map(row => row.mediaId)).toEqual([8]);
  });

  it("finds nothing for a post that does not exist or is not hashed", async () => {
    hoisted.rows.push({ id: 9, phash: null });
    const { default: findSimilarMedia } = await import("../src/lib/similarity");

    expect(findSimilarMedia(99)).toEqual([]);
    expect(findSimilarMedia(9)).toEqual([]);
  });
});
