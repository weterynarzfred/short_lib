import { spawn } from "child_process";
import sharp from "sharp";

import { FFMPEG } from "./binaries.js";

// Deliberately free of "@/" imports: the similarity backfill runs under plain node.

// A 64-bit DCT hash (the classic pHash): shrink to 32x32 grey, keep the 8x8 lowest
// frequencies, and set a bit wherever a coefficient is above their median. Low frequencies
// are the overall shape of the picture, which survives re-encoding, resizing and lossy vs
// lossless; fine detail and exact colour do not, and are ignored.
const SIZE = 32;
const LOW = 8;
const HASH_BYTES = LOW * LOW / 8;

const COSINES = Array.from({ length: LOW }, (_, u) =>
  Array.from({ length: SIZE }, (_, x) => Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIZE)))
);

// A black screen, a fade or a line of text on black hashes to noise that matches every
// other one, so frames with little contrast are left out rather than hashed. 16 drops the
// text-on-black frames that were the only false positives between videos; about 1% of
// images fall under it too, and those were matching other dark images by chance anyway.
const MIN_PIXEL_STDDEV = 16;

// Consecutive keyframes of one shot hash nearly the same, and storing each would only
// multiply the matching work. A frame this close to the last one kept is dropped.
const DUPLICATE_FRAME_DISTANCE = 4;

function hashPixels(pixels) {
  let sum = 0;
  let sumOfSquares = 0;
  for (const value of pixels) {
    sum += value;
    sumOfSquares += value * value;
  }
  const mean = sum / pixels.length;
  if (Math.sqrt(sumOfSquares / pixels.length - mean * mean) < MIN_PIXEL_STDDEV) return null;

  // Separable DCT: rows first, then columns, computing only the low frequencies.
  const rows = new Float64Array(SIZE * LOW);
  for (let y = 0; y < SIZE; y++)
    for (let u = 0; u < LOW; u++) {
      let total = 0;
      for (let x = 0; x < SIZE; x++) total += pixels[y * SIZE + x] * COSINES[u][x];
      rows[y * LOW + u] = total;
    }

  const coefficients = new Float64Array(LOW * LOW);
  for (let v = 0; v < LOW; v++)
    for (let u = 0; u < LOW; u++) {
      let total = 0;
      for (let y = 0; y < SIZE; y++) total += rows[y * LOW + u] * COSINES[v][y];
      coefficients[v * LOW + u] = total;
    }

  // The DC term is the average brightness, so it says nothing about shape and would skew
  // the median. It still gets a bit, which is always 0.
  const median = [...coefficients.slice(1)].sort((a, b) => a - b)[(LOW * LOW - 1) >> 1];

  const hash = Buffer.alloc(HASH_BYTES);
  for (let index = 1; index < LOW * LOW; index++)
    if (coefficients[index] > median) hash[index >> 3] |= 1 << (index & 7);

  return hash;
}

const BIT_COUNTS = Uint8Array.from({ length: 256 }, (_, value) => {
  let count = 0;
  for (let bits = value; bits; bits >>= 1) count += bits & 1;
  return count;
});

export function hammingDistance(left, leftOffset, right, rightOffset) {
  let distance = 0;
  for (let index = 0; index < HASH_BYTES; index++)
    distance += BIT_COUNTS[left[leftOffset + index] ^ right[rightOffset + index]];
  return distance;
}

// The first frame of an animated file; transparency is flattened onto white, which is
// what a viewer shows it on.
export async function hashImage(filePath) {
  const pixels = await sharp(filePath, { limitInputPixels: false })
    .rotate()
    .flatten({ background: "#ffffff" })
    .greyscale()
    .resize(SIZE, SIZE, { fit: "fill" })
    .raw()
    .toBuffer();

  return hashPixels(pixels) ?? Buffer.alloc(0);
}

// Every keyframe rather than a fixed number of samples, because the point is to find a
// clip inside its source: sixteen frames spread over an hour would almost never land in
// the half minute a clip was cut from. Keyframe-only decoding skips everything between
// them, so this costs 5 s on a 2.8 h 1080p file and 78 s on the worst 4K one.
export function hashVideo(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, [
      "-v", "error", "-nostdin",
      "-skip_frame", "nokey",
      "-i", filePath,
      "-an",
      "-vf", `scale=${SIZE}:${SIZE}:flags=area,format=gray`,
      "-fps_mode", "passthrough",
      "-f", "rawvideo", "-",
    ]);

    const frameBytes = SIZE * SIZE;
    const hashes = [];
    let pending = Buffer.alloc(0);

    child.stdout.on("data", chunk => {
      pending = Buffer.concat([pending, chunk]);

      while (pending.length >= frameBytes) {
        const hash = hashPixels(pending.subarray(0, frameBytes));
        pending = pending.subarray(frameBytes);

        const last = hashes.at(-1);
        if (hash && !(last && hammingDistance(hash, 0, last, 0) <= DUPLICATE_FRAME_DISTANCE))
          hashes.push(hash);
      }
    });

    let stderr = "";
    child.stderr.on("data", chunk => {
      stderr = (stderr + chunk.toString()).slice(-8192);
    });

    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve(Buffer.concat(hashes));
      else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}
