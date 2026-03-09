import { NextResponse } from "next/server";

import parseUploadForm from "./parseUploadForm";
import addMediaToDb from "./addMediaToDb";
import generateMediaDerivatives from "./generateMediaDerivatives";

export const runtime = "nodejs";

// TODO: throw on duplicate files, based on checksums
export async function POST(req) {
  try {
    const fileData = await parseUploadForm(req);

    if (!fileData || typeof fileData.entries !== "function")
      throw new Error("Invalid upload parser result");

    await generateMediaDerivatives(fileData);
    const uploaded = await addMediaToDb(fileData);

    return NextResponse.json({ status: "Upload finished", uploaded });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
