import fs from "fs";
import path from "path";
import mime from "mime-types";

const STORAGE_DIR = process.env.STORAGE_DIR;
const CHECKSUM_RE = /^[a-f0-9]{64}$/i;
const YEAR_RE = /^\d{4}$/;
const MONTH_RE = /^(0[1-9]|1[0-2])$/;

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
    if (suffixLength >= fileSize) start = 0;
    else start = fileSize - suffixLength;

    end = fileSize - 1;
  } else {
    start = Number(startText);
    if (!Number.isInteger(start) || start < 0) return null;

    if (!endText) end = fileSize - 1;
    else {
      end = Number(endText);
      if (!Number.isInteger(end)) return null;
    }
  }

  if (start >= fileSize || end < start || end >= fileSize) return null;

  return { start, end };
}

export async function GET(req, { params }) {
  const { year, month, file } = await params;

  if (!YEAR_RE.test(year) || !MONTH_RE.test(month))
    return new Response("Bad request", { status: 400 });

  const url = new URL(req.url);
  const size = url.searchParams.get("size");

  const parsed = path.parse(file);
  const checksum = parsed.name;
  const ext = parsed.ext;
  if (!CHECKSUM_RE.test(checksum))
    return new Response("Bad request", { status: 400 });

  if (parsed.base !== file || parsed.dir)
    return new Response("Bad request", { status: 400 });

  let baseDir = "full";
  let filename = `${checksum}${ext}`;

  if (size === "thumb") {
    baseDir = "thumbs";
    filename = `${checksum}.jpg`;
  }

  if (size === "prev") {
    baseDir = "prevs";
    filename = `${checksum}.jpg`;
  }

  const basePath = path.resolve(STORAGE_DIR, baseDir);
  const filePath = path.resolve(basePath, year, month, filename);
  const relative = path.relative(basePath, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    return new Response("Bad request", { status: 400 });

  if (!fs.existsSync(filePath)) return new Response("Not found", { status: 404 });

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const contentType = mime.lookup(filePath) || "application/octet-stream";

  const range = req.headers.get("range");

  if (!range) {
    const stream = fs.createReadStream(filePath);
    return new Response(stream, {
      headers: {
        "Content-Type": contentType,
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

  return new Response(stream, {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Length": chunkSize.toString(),
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
    },
  });
}
