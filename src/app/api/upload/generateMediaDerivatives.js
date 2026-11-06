import processImage from "./processImage";
import processVideo from "./processVideo";
import mimetypeToType from "@/lib/mimetypeToType";
import { hashImage, hashVideo } from "@/lib/perceptualHash";

export default async function generateMediaDerivatives(fileData) {
  for (const metadata of fileData.values()) {
    const mediaType = mimetypeToType(metadata.mimetype);

    let variants = null;
    if (mediaType === "image")
      variants = await processImage(metadata);
    else if (mediaType === "video")
      variants = await processVideo(metadata);

    if (variants) metadata.variants = variants;

    // A failed hash must not fail the upload: the post only drops out of `similar:` until
    // the backfill script fills the gap.
    try {
      if (mediaType === "image") metadata.phash = await hashImage(metadata.filepath);
      else if (mediaType === "video") metadata.phash = await hashVideo(metadata.filepath);
    } catch (error) {
      console.error("perceptual hashing failed:", error);
    }
  }
}
