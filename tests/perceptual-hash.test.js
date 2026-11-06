import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";

import { hammingDistance, hashImage } from "../src/lib/perceptualHash";

const SIZE = 256;

// Deterministic pictures with real structure, since a perceptual hash of noise means nothing.
function picture(draw) {
  const pixels = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      pixels.fill(draw(x, y), (y * SIZE + x) * 3, (y * SIZE + x) * 3 + 3);

  return sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } });
}

describe("perceptual hash", () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "shortlib-phash-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("matches a re-encoded, resized copy and not a different picture", async () => {
    const circle = (x, y) => (Math.hypot(x - 90, y - 120) < 60 ? 230 : 20 + x / 4);
    const stripes = (x, y) => (Math.floor(y / 32) % 2 ? 200 : 40);

    await picture(circle).png().toFile(path.join(dir, "original.png"));
    await picture(circle).resize(97, 97).jpeg({ quality: 40 }).toFile(path.join(dir, "copy.jpg"));
    await picture(stripes).png().toFile(path.join(dir, "other.png"));

    const original = await hashImage(path.join(dir, "original.png"));
    const copy = await hashImage(path.join(dir, "copy.jpg"));
    const other = await hashImage(path.join(dir, "other.png"));

    expect(original).toHaveLength(8);
    expect(hammingDistance(original, 0, copy, 0)).toBeLessThanOrEqual(4);
    expect(hammingDistance(original, 0, other, 0)).toBeGreaterThan(16);
  });

  it("hashes a flat picture to nothing rather than to noise", async () => {
    await picture(() => 128).png().toFile(path.join(dir, "flat.png"));

    expect(await hashImage(path.join(dir, "flat.png"))).toHaveLength(0);
  });
});
