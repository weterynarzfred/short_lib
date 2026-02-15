import fs from "fs";
import path from "path";
import mime from "mime-types";

const STORAGE_DIR = process.env.STORAGE_DIR;

export async function GET(req, { params }) {
  const { year, month, file } = await params;

  const url = new URL(req.url);
  const size = url.searchParams.get("size");

  const parsed = path.parse(file);
  const checksum = parsed.name;
  const ext = parsed.ext;

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

  const filePath = path.join(STORAGE_DIR, baseDir, year, month, filename);

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

  const parts = range.replace(/bytes=/, "").split("-");
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

  if (start >= fileSize || end >= fileSize) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${fileSize}`,
      },
    });
  }

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
