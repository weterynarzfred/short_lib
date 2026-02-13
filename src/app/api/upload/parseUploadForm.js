import { createWriteStream } from "fs";
import fs from "fs/promises";
import formidable from "formidable";
import crypto from "crypto";
import { Readable, Transform } from "stream";
import path from "path";

import extractMetadata from "@/app/api/upload/extractMetadata";

const uploadDir = path.join(process.cwd(), "storage", "full");
await fs.mkdir(uploadDir, { recursive: true });

function getSafeFilename(filename, ext) {
  const base = path.parse(filename).name;

  const safe = base
    .replace(/[^\w.-]/g, "_")
    .substring(0, 64);

  return `${Date.now()}_${safe}${ext}`;
}

export default async function parseUploadForm(req) {
  const fileData = new Map();

  const form = formidable({
    multiples: true,
    keepExtensions: true,
    maxFileSize: 1024 * 1024 * 1024 * 80,
    maxTotalFileSize: 1024 * 1024 * 1024 * 80,
    filename: (_name, ext, part) =>
      getSafeFilename(part.originalFilename || "file", ext),
    fileWriteStreamHandler: file => {
      const hash = crypto.createHash("sha256");
      const filepath = path.join(uploadDir, file.newFilename);
      const writeStream = createWriteStream(filepath);

      const finished = new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });

      const hashStream = new Transform({
        transform(chunk, _enc, cb) {
          hash.update(chunk);
          writeStream.write(chunk, cb);
        },
        final(cb) {
          writeStream.end(cb);
        },
      });

      fileData.set(file.newFilename, {
        filepath,
        mimetype: file.mimetype,
        hash,
        finished,
      });

      return hashStream;
    },
  });

  const nodeReq = Readable.fromWeb(req.body);
  nodeReq.headers = {
    "content-type": req.headers.get("content-type"),
    "content-length": req.headers.get("content-length"),
  };
  nodeReq.method = req.method;

  await form.parse(nodeReq);
  await Promise.all([...fileData.values()].map(f => f.finished));

  for (const file of fileData.values()) {
    file.checksum = file.hash.digest("hex");

    const meta = await extractMetadata(file.filepath);

    file.size = meta.size;
    file.mimetype = meta.mimetype;
    file.type = meta.type;
    file.dimensions = meta.dimensions;
    file.duration = meta.duration;

    delete file.hash;
    delete file.finished;
  }

  return fileData;
};
