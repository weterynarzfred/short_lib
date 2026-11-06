import fs from "fs";
import path from "path";
import mime from "mime-types";
import { Readable } from "stream";

import { streamFfmpeg } from "@/lib/ffmpeg";
import resolveStoragePath from "@/lib/resolveStoragePath";

const CHECKSUM_RE = /^[a-f0-9]{64}$/i;
const YEAR_RE = /^\d{4}$/;
const MONTH_RE = /^(0[1-9]|1[0-2])$/;

// Filenames are checksums already
const IMMUTABLE = "public, max-age=31536000, immutable";

function outOfRange(fileSize) {
  return new Response(null, {
    status: 416,
    headers: {
      "Content-Range": `bytes */${fileSize}`,
    },
  });
}

function parseRange(rangeHeader, fileSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? "");
  if (!match) return null;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  let start;
  let end;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;

    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    // Digits only, per the regex; anything out of range fails the bounds check below.
    start = Number(startText);
    end = endText ? Number(endText) : fileSize - 1;
  }

  if (start >= fileSize || end < start || end >= fileSize) return null;

  return { start, end };
}

// Streams copied, not re-encoded: browsers will not play mkv, but its contents are usually
// already mp4-compatible, so only the container has to change.
function remuxMkvToMp4(filePath, signal) {
  return streamFfmpeg([
    "-v", "error",
    "-i", filePath,
    "-map", "0:v?",
    "-map", "0:a?",
    "-c", "copy",
    // A pipe cannot be seeked back to write the moov atom, so the output is fragmented.
    "-movflags", "+frag_keyframe+empty_moov",
    "-f", "mp4",
    "pipe:1",
  ], { signal, label: "remuxing mkv" });
}

export async function GET(req, { params }) {
  const { year, month, file } = await params;

  if (!YEAR_RE.test(year) || !MONTH_RE.test(month))
    return new Response("Bad request", { status: 400 });

  const url = new URL(req.url);
  const size = url.searchParams.get("size");

  const { name: checksum, ext, base, dir } = path.parse(file);
  if (!CHECKSUM_RE.test(checksum) || base !== file || dir)
    return new Response("Bad request", { status: 400 });

  let baseDir = "full";
  let filename = file;

  if (size === "thumb") {
    baseDir = "thumbs";
    filename = `${checksum}.jpg`;
  } else if (size === "vprev") {
    // Short silent AV1 clip used for hover previews on video posts.
    baseDir = "vprevs";
    filename = `${checksum}.mp4`;
  }

  const filePath = resolveStoragePath(baseDir, year, month, filename);
  if (!filePath) return new Response("Bad request", { status: 400 });

  if (!fs.existsSync(filePath)) return new Response("Not found", { status: 404 });

  const fileSize = fs.statSync(filePath).size;
  const contentType = mime.lookup(filePath) || "application/octet-stream";
  const isMkvInFullDir = baseDir === "full" && ext.toLowerCase() === ".mkv";

  if (isMkvInFullDir) {
    const stream = remuxMkvToMp4(filePath, req.signal);
    // Readable.toWeb rather than the Node stream itself: Response's own wrapping throws an
    // uncaught "ReadableStream is already closed" when the client cancels mid-read.
    return new Response(Readable.toWeb(stream), {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": IMMUTABLE,
        "Content-Security-Policy": "sandbox",
        "Accept-Ranges": "none",
      },
    });
  }

  const range = req.headers.get("range");

  if (!range) {
    const stream = fs.createReadStream(filePath);
    return new Response(Readable.toWeb(stream), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": IMMUTABLE,
        // An uploaded SVG opened as a page would otherwise run its scripts on this origin.
        "Content-Security-Policy": "sandbox",
        "Content-Length": fileSize.toString(),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const parsedRange = parseRange(range, fileSize);
  if (!parsedRange) return outOfRange(fileSize);

  const { start, end } = parsedRange;

  const chunkSize = end - start + 1;
  const stream = fs.createReadStream(filePath, { start, end });

  return new Response(Readable.toWeb(stream), {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": IMMUTABLE,
      "Content-Security-Policy": "sandbox",
      "Content-Length": chunkSize.toString(),
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
    },
  });
}
