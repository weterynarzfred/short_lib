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

  const filePath = path.join(
    STORAGE_DIR,
    baseDir,
    year,
    month,
    filename
  );

  if (!filePath.startsWith(path.join(STORAGE_DIR))) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }

  const stream = fs.createReadStream(filePath);

  return new Response(stream, {
    headers: {
      "Content-Type": mime.lookup(filePath) || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
