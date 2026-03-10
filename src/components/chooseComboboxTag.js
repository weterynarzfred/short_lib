export default function chooseComboboxTag({ prev, cursor, tag }) {
  const isOperator = tag.type === "operator";
  const pos = typeof cursor === "number" ? cursor : prev.length;

  const start = prev.slice(0, pos).lastIndexOf(" ") + 1;
  const nextSpace = prev.indexOf(" ", pos);
  const end = nextSpace === -1 ? prev.length : nextSpace;

  const token = prev.slice(start, end);
  const isNegative = token.startsWith("-");
  const sign = isNegative ? "-" : "";

  const contentStart = start + sign.length;
  const left = prev.slice(contentStart, pos);
  const right = prev.slice(pos, end);

  let consumedRight = 0;

  if (tag.name.startsWith(left)) {
    for (let i = right.length; i >= 0; i--) {
      if (tag.name.startsWith(left + right.slice(0, i))) {
        consumedRight = i;
        break;
      }
    }
  }

  const remainingRight = right.slice(consumedRight);
  const hasSpaceAfterToken = prev[end] === " ";

  const separator = remainingRight
    ? (isOperator ? "" : " ")
    : (isOperator || hasSpaceAfterToken ? "" : " ");

  const next =
    prev.slice(0, start) +
    sign +
    tag.name +
    separator +
    remainingRight +
    prev.slice(end);

  const nextCursor =
    start +
    sign.length +
    tag.name.length +
    separator.length +
    (!remainingRight && hasSpaceAfterToken && !isOperator ? 1 : 0);

  return { next, nextCursor };
}
