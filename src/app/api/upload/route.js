import fs from "fs/promises";
import { NextResponse } from "next/server";

import parseUploadForm from "./parseUploadForm";
import placeUploadedFiles from "./placeUploadedFiles";
import addMediaToDb from "./addMediaToDb";
import generateMediaDerivatives from "./generateMediaDerivatives";
import { findExistingChecksums } from "@/lib/mediaChecksums";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const fileData = await parseUploadForm(req);

    const checksums = [...fileData.values()]
      .map(file => file.checksum)
      .filter(Boolean);

    const existingPost = findExistingChecksums(checksums);
    if (existingPost) {
      await Promise.all([...fileData.values()].map(file => fs.rm(file.filepath, { force: true })));
      return NextResponse.json(
        {
          error: "Duplicate file",
          existingPost,
        },
        { status: 409 }
      );
    }

    await placeUploadedFiles(fileData);
    await generateMediaDerivatives(fileData);
    const uploaded = await addMediaToDb(fileData);

    return NextResponse.json({ status: "Upload finished", uploaded });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
