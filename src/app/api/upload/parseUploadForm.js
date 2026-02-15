import { createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import formidable from "formidable";
import crypto from "crypto";
import { Readable, Transform } from "stream";

import extractMetadata from "./extractMetadata";
import { getFinalPath, getTempPath } from "@/app/api/upload/path_helpers";

export default async function parseUploadForm(req) {
  const fileData = new Map();

  const form = formidable({
    multiples: true,
    keepExtensions: true,
    maxFileSize: 1024 * 1024 * 1024 * 80,
    maxTotalFileSize: 1024 * 1024 * 1024 * 80,
    filename: (_name, ext) =>
      `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`,
    fileWriteStreamHandler: file => {
      const hash = crypto.createHash("sha256");
      const filepath = getTempPath(file.newFilename);
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
        originalFilename: file.originalFilename,
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
    file.uploadDate = new Date();

    const ext = path.extname(file.filepath);
    const finalPath = getFinalPath(file, ext);

    try {
      await fs.rename(file.filepath, finalPath);
    } catch (err) {
      if (err.code === "EEXIST") await fs.unlink(file.filepath);
      else throw err;
    }

    file.filepath = finalPath;

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
