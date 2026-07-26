import processImage from "./processImage";
import processVideo from "./processVideo";
import mimetypeToType from "@/lib/mimetypeToType";

export default async function generateMediaDerivatives(fileData) {
  for (const metadata of fileData.values()) {
    const { mimetype } = metadata;
    if (!mimetype) continue;

    const mediaType = mimetypeToType(mimetype);

    let variants = null;
    if (mediaType === "image")
      variants = await processImage(metadata);
    else if (mediaType === "video")
      variants = await processVideo(metadata);

    if (variants) metadata.variants = variants;
  }
}
