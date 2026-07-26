export default function chooseComboboxTag({ prev, cursor, tag }) {
  const isOperator = tag.type === "operator";
  // Operators taking free text open an empty quoted phrase, so a multi-word value can be
  // typed without remembering to add the quotes. Harmless for a single word.
  const opensQuotedValue = isOperator && tag.quoted === true;
  const insertName = tag.insertName ?? tag.name;
  const matchName = tag.matchName ?? insertName;
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

  if (matchName.startsWith(left)) {
    for (let i = right.length; i >= 0; i--) {
      if (matchName.startsWith(left + right.slice(0, i))) {
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

  const insertion = opensQuotedValue ? `${insertName}""` : insertName;

  const next =
    prev.slice(0, start) +
    sign +
    insertion +
    separator +
    remainingRight +
    prev.slice(end);

  // Land between the quotes rather than after them.
  const nextCursor =
    start +
    sign.length +
    insertName.length +
    (opensQuotedValue ? 1 : 0) +
    separator.length +
    (!remainingRight && hasSpaceAfterToken && !isOperator ? 1 : 0);

  return { next, nextCursor };
}
