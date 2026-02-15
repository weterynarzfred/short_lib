export default function scaleToTotalPixels(width, height, targetPixels) {
  const sourcePixels = width * height;
  if (sourcePixels <= targetPixels) return { width, height };

  const scale = Math.sqrt(targetPixels / sourcePixels);

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}
