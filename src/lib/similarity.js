import db from "@/lib/db";

// Calibrated against the whole library (2276 posts, 114k frames) by eye. Distances are
// differing bits out of 64; two unrelated pictures sit around 30.
//
// One picture against one picture: 0-6 were all real copies, 8 and up were dark images with
// a bright spot in the middle matching each other.
const SINGLE_FRAME_DISTANCE = 6;

// Video frames are looser because two encodes put their keyframes at different moments, so
// the closest frame of a copy is a fraction of a second off rather than identical.
const FRAME_MATCH_DISTANCE = 10;

// Videos are similar when this share of the shorter one's frames turns up in the other, so
// a clip matches the hour-long source it was cut from. Every pair at 0.5 or above was real,
// and two real ones sat at 0.41 and 0.44; below that it was noise.
const MIN_MATCHED_FRACTION = 0.4;
// Two, so a single lucky frame cannot carry a short clip.
const MIN_MATCHED_FRAMES = 2;

// An image is never matched against a multi-frame video: one frame tried against thousands
// finds a chance match, and every such hit in the library was one.

const selectHash = db.prepare(`SELECT phash FROM media WHERE id = ?`);

// No cache: every hash in the library is under 2 MB together, and reading it fresh means
// uploads and deletes never leave a stale index behind.
const selectHashes = db.prepare(`
  SELECT id, phash
  FROM media
  WHERE LENGTH(phash) > 0
    AND id <> ?
`);

// Two 32-bit words per 64-bit hash, so a distance is two popcounts instead of eight lookups.
// A query of a long video against the whole library is a few hundred million of them.
function toWords(hash) {
  const words = new Uint32Array(hash.length / 4);
  for (let index = 0; index < words.length; index++) words[index] = hash.readUInt32LE(index * 4);
  return words;
}

function popcount(value) {
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

// For each frame of the shorter side, its distance to the closest frame of the longer one.
function closestDistances(shorter, longer) {
  const distances = [];

  for (let left = 0; left < shorter.length; left += 2) {
    let best = 64;
    for (let right = 0; right < longer.length && best > 0; right += 2) {
      const distance = popcount(shorter[left] ^ longer[right])
        + popcount(shorter[left + 1] ^ longer[right + 1]);
      if (distance < best) best = distance;
    }
    distances.push(best);
  }

  return distances;
}

function compare(left, right) {
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];

  if (longer.length === 2) {
    const [distance] = closestDistances(shorter, longer);
    return distance <= SINGLE_FRAME_DISTANCE ? { matchedFraction: 1, meanDistance: distance } : null;
  }
  if (shorter.length === 2) return null;

  const distances = closestDistances(shorter, longer);
  const matched = distances.filter(distance => distance <= FRAME_MATCH_DISTANCE).length;
  const matchedFraction = matched / distances.length;
  if (matched < MIN_MATCHED_FRAMES || matchedFraction < MIN_MATCHED_FRACTION) return null;

  const meanDistance = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
  return { matchedFraction, meanDistance };
}

// Most similar first, led by the post itself so the listing shows what it is comparing
// against. A post with no hash yet only finds itself.
export default function findSimilarMedia(postId) {
  const hash = selectHash.get(postId)?.phash;
  if (!hash) return [];

  const query = toWords(hash);
  const matches = [];

  if (query.length) {
    for (const row of selectHashes.all(postId)) {
      const match = compare(query, toWords(row.phash));
      if (match) matches.push({ mediaId: row.id, ...match });
    }
  }

  matches.sort((left, right) =>
    right.matchedFraction - left.matchedFraction || left.meanDistance - right.meanDistance);

  return [{ mediaId: postId, matchedFraction: 1, meanDistance: 0 }, ...matches];
}
