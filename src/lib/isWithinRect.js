// Point-in-rect with slack, used to keep a hover card open while the pointer travels the
// few pixels between the thing it describes and the card itself.
export default function isWithinRect(rect, x, y, padding = 0) {
  if (!rect) return false;

  return x >= rect.left - padding
    && x <= rect.right + padding
    && y >= rect.top - padding
    && y <= rect.bottom + padding;
}
