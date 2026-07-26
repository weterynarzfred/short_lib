export default function parseComparable(rawValue, regex, units, defaultUnit, options = {}) {
  const { integer = true } = options;
  const match = regex.exec(rawValue.trim());
  if (!match) return null;

  const [, opRaw, numRaw, unitRaw] = match;
  const unit = (unitRaw || defaultUnit).toLowerCase();
  const multiplier = units[unit];
  if (!multiplier) return null;

  const parsedNumber = Number(numRaw);
  if (!Number.isFinite(parsedNumber) || parsedNumber < 0) return null;

  return {
    op: opRaw || "=",
    value: integer
      ? Math.floor(parsedNumber * multiplier)
      : parsedNumber * multiplier,
  };
}
