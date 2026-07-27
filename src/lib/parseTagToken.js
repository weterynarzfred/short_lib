// Splits one whitespace-delimited tag token into its parts. Handles the three shapes that
// appear in editors and search boxes: `cat`, `meta:image`, and a leading `-` for negation.
export default function parseTagToken(token) {
  const raw = String(token ?? "").trim();
  const negated = raw.startsWith("-");
  const stripped = negated ? raw.slice(1) : raw;

  const colonIndex = stripped.indexOf(":");
  // A colon at either end is part of the name, not a type separator.
  if (colonIndex > 0 && colonIndex < stripped.length - 1) {
    const type = stripped.slice(0, colonIndex).trim();
    const name = stripped.slice(colonIndex + 1).trim();
    if (type && name) return { name, type, negated };
  }

  return { name: stripped, type: "", negated };
}
