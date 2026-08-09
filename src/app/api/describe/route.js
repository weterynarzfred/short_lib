import fs from "fs";
import path from "path";

import db from "@/lib/db";
import describeImage from "@/lib/describeImage";
import mimetypeToType from "@/lib/mimetypeToType";
import { getDescribePrompt } from "@/lib/userSettings";

const STORAGE_DIR = process.env.STORAGE_DIR;

const selectMedia = db.prepare(`
  SELECT file_path, mime_type
  FROM media
  WHERE id = ?
`);

// A POST rather than a server action: the first call after an idle period waits out a
// model load, and a plain route lets the client own that timeout and show it happening.
export async function POST(req) {
  if (!STORAGE_DIR) return Response.json({ error: "Storage is not configured" }, { status: 500 });

  const { id } = await req.json().catch(() => ({}));
  if (!Number.isInteger(id) || id <= 0)
    return Response.json({ error: "Bad request" }, { status: 400 });

  const media = selectMedia.get(id);
  if (!media) return Response.json({ error: "Not found" }, { status: 404 });

  // Images only for now. A video would need frames sampled and stitched into one sheet,
  // and audio needs a different model entirely.
  if (mimetypeToType(media.mime_type) !== "image")
    return Response.json({ error: "Only images can be described" }, { status: 400 });

  const base = path.resolve(STORAGE_DIR, "full");
  const filePath = path.resolve(base, media.file_path);
  if (!filePath.startsWith(base + path.sep))
    return Response.json({ error: "Bad request" }, { status: 400 });
  if (!fs.existsSync(filePath))
    return Response.json({ error: "The file is missing from storage" }, { status: 404 });

  try {
    return Response.json({ text: await describeImage(filePath, getDescribePrompt()) });
  } catch (error) {
    console.error(`describing media ${id} failed:`, error.message);

    // The interesting failure is "nothing answered", which means the service manager could
    // not start the model - worth distinguishing from the model itself refusing.
    const isUnreachable = error.name === "TimeoutError"
      || error.cause?.code === "ECONNREFUSED"
      || error.cause?.code === "ECONNRESET";

    return Response.json({
      error: isUnreachable
        ? "The model did not respond. It may still be loading - try again in a minute."
        : `Describing failed: ${error.message}`,
    }, { status: 502 });
  }
}
