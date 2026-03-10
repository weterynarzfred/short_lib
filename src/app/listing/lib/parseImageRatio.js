const IMAGE_RATIO_RE = /^(<=|>=|<|>|=)?(.+)$/i;

export default function parseImageRatio(rawValue) {
  const match = IMAGE_RATIO_RE.exec(rawValue.trim());
  if (!match) return null;

  const [, opRaw, valueRaw] = match;
  const ratioText = valueRaw.trim();
  if (!ratioText) return null;

  let ratio;
  if (ratioText.includes("/")) {
    const [left, right] = ratioText.split("/");
    const a = Number(left);
    const b = Number(right);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0 || a < 0 || b < 0)
      return null;
    ratio = a / b;
  } else {
    ratio = Number(ratioText);
    if (!Number.isFinite(ratio) || ratio < 0) return null;
  }

  return {
    op: opRaw || "=",
    value: ratio,
  };
}
