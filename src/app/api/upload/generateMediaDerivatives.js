import processImage from "./processImage";
import processVideo from "./processVideo";

export default async function generateMediaDerivatives(fileData) {
  for (const metadata of fileData.values()) {
    const { mimetype } = metadata;
    if (!mimetype) continue;

    let variants = null;
    if (mimetype.startsWith("image/"))
      variants = await processImage(metadata);
    else if (mimetype.startsWith("video/"))
      variants = await processVideo(metadata);

    if (variants) metadata.variants = variants;
  }
}
