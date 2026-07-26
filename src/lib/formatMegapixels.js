export default function formatMegapixels(width, height) {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight)) return "";
  if (safeWidth <= 0 || safeHeight <= 0) return "";

  const megapixels = (safeWidth * safeHeight) / 1_000_000;
  // Round to a tenth first, so anything that would render as "0.0MP" is reported as
  // the smallest visible value instead.
  const rounded = Math.round(megapixels * 10) / 10;
  if (rounded < 0.1) return "0.1MP";
  if (rounded < 10) return `${rounded.toFixed(1)}MP`;

  return `${Math.round(megapixels)}MP`;
}
