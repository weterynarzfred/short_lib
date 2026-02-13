import fs from "fs";
import path from "path";

export async function GET(_req, { params }) {
  const requestedPath = (await params).path.join("/");
  const filePath = path.join(process.cwd(), "storage", requestedPath);

  if (!filePath.startsWith(path.join(process.cwd(), "storage"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const file = fs.readFileSync(filePath);

  return new Response(file, {
    headers: { "Content-Type": "image/jpeg" },
  });
}
