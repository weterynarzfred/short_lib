import { NextResponse } from "next/server";
import parseUploadForm from "@/app/api/upload/parseUploadForm";
import addMediaToDb from "@/app/api/upload/addMediaToDb";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const fileData = await parseUploadForm(req);

    if (!fileData || typeof fileData.entries !== "function")
      throw new Error("Invalid upload parser result");

    const results = addMediaToDb(fileData);

    return NextResponse.json({ files: results });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
