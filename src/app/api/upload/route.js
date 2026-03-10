import { NextResponse } from "next/server";

import parseUploadForm from "./parseUploadForm";
import addMediaToDb from "./addMediaToDb";
import generateMediaDerivatives from "./generateMediaDerivatives";
import { findExistingChecksums } from "@/lib/mediaChecksums";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const fileData = await parseUploadForm(req);

    if (!fileData || typeof fileData.entries !== "function")
      throw new Error("Invalid upload parser result");

    const checksums = [...fileData.values()]
      .map(file => file.checksum)
      .filter(Boolean);

    const existingPost = findExistingChecksums(checksums);
    if (existingPost) return NextResponse.json(
      {
        error: "Duplicate file",
        existingPost,
      },
      { status: 409 }
    );

    await generateMediaDerivatives(fileData);
    const uploaded = await addMediaToDb(fileData);

    return NextResponse.json({ status: "Upload finished", uploaded });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
