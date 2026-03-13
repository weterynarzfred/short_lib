export const DEFAULT_TAG_TYPE_ORDER = [
  "meta",
  "rating",
  "creator",
  "copyright",
  "character",
  "general",
];

function toTagType(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeTagTypeOrder(rawValue) {
  const normalized = [];
  const seen = new Set();

  const pushType = value => {
    const type = toTagType(value);
    if (!type || seen.has(type)) return;
    seen.add(type);
    normalized.push(type);
  };

  if (Array.isArray(rawValue)) {
    for (const item of rawValue) pushType(item);
    return normalized;
  }

  if (typeof rawValue !== "string") return normalized;

  for (const token of rawValue.split(/\s+/))
    pushType(token);

  return normalized;
}

export function parseStoredTagTypeOrder(rawValue) {
  if (typeof rawValue !== "string") return [];

  const trimmed = rawValue.trim();
  if (!trimmed) return [];

  try {
    return normalizeTagTypeOrder(JSON.parse(trimmed));
  } catch { }

  return normalizeTagTypeOrder(trimmed);
}

export function mergeTagTypeOrder(preferredOrder = [], availableTypes = []) {
  const merged = [];
  const seen = new Set();

  const pushType = value => {
    const type = toTagType(value);
    if (!type || seen.has(type)) return;
    seen.add(type);
    merged.push(type);
  };

  for (const type of preferredOrder) pushType(type);
  for (const type of availableTypes) pushType(type);

  if (!merged.length) {
    for (const type of DEFAULT_TAG_TYPE_ORDER)
      pushType(type);
  }

  return merged;
}

function escapeSqlString(value) {
  return value.replace(/'/g, "''");
}

export function buildTagTypeOrderSql(tagTypeOrder = DEFAULT_TAG_TYPE_ORDER) {
  const normalizedOrder = normalizeTagTypeOrder(tagTypeOrder);
  const safeOrder = normalizedOrder.length
    ? normalizedOrder
    : DEFAULT_TAG_TYPE_ORDER;

  const whenClauses = safeOrder
    .map((type, index) => `WHEN '${escapeSqlString(type)}' THEN ${index}`)
    .join("\n    ");

  return `
  CASE LOWER(COALESCE(t.type, ''))
    ${whenClauses}
    ELSE ${safeOrder.length}
  END
`;
}
