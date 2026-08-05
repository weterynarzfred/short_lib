export const DEFAULT_TAG_TYPE_ORDER = [
  "meta",
  "rating",
  "creator",
  "copyright",
  "character",
  "general",
];
export const DEFAULT_TAG_TYPE_COLOR = "#EEEEEE";

const TAG_TYPE_COLOR_PATTERN = /^#?[0-9a-fA-F]{3,6}$/;
const TAG_TYPE_CLASS_CHAR_PATTERN = /[^a-zA-Z0-9_]/g;

export function normalizeTagTypeOrder(rawValue) {
  const tokens = Array.isArray(rawValue)
    ? rawValue
    : typeof rawValue === "string"
      ? rawValue.split(/\s+/)
      : [];
  const types = [];
  const seen = new Set();

  for (const token of tokens) {
    const type = String(token ?? "").trim().toLowerCase();
    if (!type || seen.has(type)) continue;
    seen.add(type);
    types.push(type);
  }

  return types;
}

export function normalizeTagTypeColor(value) {
  const color = typeof value === "string" ? value.trim() : "";
  if (!TAG_TYPE_COLOR_PATTERN.test(color))
    return DEFAULT_TAG_TYPE_COLOR;

  return color.startsWith("#") ? color : `#${color}`;
}

// A stored map of type -> colour, cleaned up: lowercased keys, every value a usable hex.
export function normalizeTagTypeColors(rawValue) {
  const normalized = {};
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue))
    return normalized;

  for (const [rawType, rawColor] of Object.entries(rawValue)) {
    const type = String(rawType ?? "").trim().toLowerCase();
    if (!type) continue;
    normalized[type] = normalizeTagTypeColor(rawColor);
  }

  return normalized;
}

// The colours actually in play: one entry per type that exists, preferring the stored
// colour and falling back to the default. Types that no longer exist drop out.
export function mergeTagTypeColors(preferredColors = {}, availableTypes = []) {
  const normalizedColors = normalizeTagTypeColors(preferredColors);
  const merged = {};

  for (const rawType of availableTypes) {
    const type = String(rawType ?? "").trim().toLowerCase();
    if (!type || merged[type]) continue;
    merged[type] = normalizedColors[type] ?? DEFAULT_TAG_TYPE_COLOR;
  }

  return merged;
}

export function getTagTypeClassName(value) {
  const suffix = String(value ?? "").trim().replace(TAG_TYPE_CLASS_CHAR_PATTERN, "_");
  return suffix ? `tag-type-${suffix}` : "";
}

export function buildTagTypeColorsCss(tagTypeColors = {}) {
  if (!tagTypeColors || typeof tagTypeColors !== "object" || Array.isArray(tagTypeColors))
    return "";

  const rules = [];
  const seen = new Set();

  for (const [rawType, rawColor] of Object.entries(tagTypeColors)) {
    const type = String(rawType ?? "").trim().toLowerCase();
    const className = getTagTypeClassName(type);
    if (!className || seen.has(className)) continue;

    seen.add(className);
    rules.push(`.${className} { color: ${normalizeTagTypeColor(rawColor)}; }`);
  }

  return rules.join("\n");
}

export function buildTagTypeOrderSql(tagTypeOrder = DEFAULT_TAG_TYPE_ORDER) {
  const safeOrder = normalizeTagTypeOrder(tagTypeOrder);
  const orderedTypes = safeOrder.length ? safeOrder : DEFAULT_TAG_TYPE_ORDER;
  const whenClauses = orderedTypes
    .map((type, index) => `WHEN '${type.replace(/'/g, "''")}' THEN ${index}`)
    .join("\n    ");

  return `
  CASE LOWER(COALESCE(t.type, ''))
    ${whenClauses}
    ELSE ${orderedTypes.length}
  END
`;
}
