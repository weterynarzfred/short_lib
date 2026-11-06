import { createWriteStream } from "fs";
import fs from "fs/promises";
import formidable from "formidable";
import crypto from "crypto";
import { Readable, Transform } from "stream";

import { getTempPath } from "@/app/api/upload/path_helpers";

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

      // 'close' settles it after the cleanup below destroys the stream.
      const finished = new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("close", resolve);
        writeStream.on("error", reject);
      });
      // A write error rejects this before anything awaits it; the error still reaches
      // form.parse through the Transform's write callback.
      finished.catch(() => {});

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
        writeStream,
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

  // formidable's destroy() on abort or error only destroys the Transform, so the real
  // write stream and its temp file have to be cleaned up here.
  try {
    await form.parse(nodeReq);
    await Promise.all([...fileData.values()].map(f => f.finished));
  } catch (err) {
    for (const f of fileData.values()) f.writeStream.destroy();
    // Windows will not unlink a file that is still open, so wait for close first.
    await Promise.allSettled([...fileData.values()].map(f => f.finished));
    await Promise.all([...fileData.values()].map(f => fs.rm(f.filepath, { force: true })));
    throw err;
  }

  // Files stay in tmp/ until the route has checked them for duplicates.
  for (const file of fileData.values()) {
    file.checksum = file.hash.digest("hex");
    file.uploadDate = new Date();

    delete file.hash;
    delete file.finished;
    delete file.writeStream;
  }

  return fileData;
}
