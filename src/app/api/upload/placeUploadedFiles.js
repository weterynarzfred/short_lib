import fs from "fs/promises";
import path from "path";

import extractMetadata from "./extractMetadata";
import { getFinalPath } from "@/app/api/upload/path_helpers";

// Moves each parsed upload from tmp/ into full/ and reads its metadata. Runs only after
// the duplicate check, so a duplicate never leaves a file in full/ that no row points at.
export default async function placeUploadedFiles(fileData) {
  for (const file of fileData.values()) {
    const ext = path.extname(file.filepath);
    const finalPath = getFinalPath(file, ext);

    try {
      await fs.rename(file.filepath, finalPath);
    } catch (err) {
      if (err.code === "EEXIST") await fs.unlink(file.filepath);
      else throw err;
    }

    file.filepath = finalPath;

    const meta = await extractMetadata(file.filepath, {
      fallbackMimeType: file.mimetype,
    });

    file.size = meta.size;
    file.mimetype = meta.mimetype;
    file.type = meta.type;
    file.dimensions = meta.dimensions;
    file.duration = meta.duration;
    file.hasAudio = meta.hasAudio;
  }
}
