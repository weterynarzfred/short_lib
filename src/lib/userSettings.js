import db from "@/lib/db";
import parseTagToken from "@/lib/parseTagToken";
import {
  DEFAULT_TAG_TYPE_ORDER,
  buildTagTypeColorsCss,
  buildTagTypeOrderSql,
  mergeTagTypeColors,
  normalizeTagTypeColors,
  normalizeTagTypeOrder,
} from "@/lib/tagTypeOrder";

export const MEDIA_SETTINGS_DEFAULTS = {
  autoplay: false,
  loop: false,
  slideshow: false,
  muted: false,
  fullscreen: false,
  info: true,
};
export const BLACKLISTED_TAGS_KEY = "listing.blacklisted_tags";
export const TAG_TYPE_ORDER_KEY = "listing.tag_type_order";
export const TAG_TYPE_COLORS_KEY = "listing.tag_type_colors";

const MEDIA_SETTING_KEYS = new Set(Object.keys(MEDIA_SETTINGS_DEFAULTS));

const getMediaRowsStmt = db.prepare(`
  SELECT key, value
  FROM user_settings
  WHERE key LIKE 'media.%'
`);
const getSettingStmt = db.prepare(`
  SELECT value
  FROM user_settings
  WHERE key = ?
  LIMIT 1
`);
// Stored lowercased and never empty, so no cleanup is needed here.
const getTagTypesStmt = db.prepare(`
  SELECT DISTINCT type
  FROM tags
  ORDER BY type ASC
`);

const upsertSettingStmt = db.prepare(`
  INSERT INTO user_settings (key, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`);

function isTrue(raw) {
  return raw === "1" || raw === "true";
}

function parseTagNames(raw) {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map(parseTagToken)
    // Negated entries are dropped, not unwrapped: "-cat" must not blacklist "cat".
    .filter(t => !t.negated && t.name)
    .map(t => t.name);
}

function normalizeTagNames(rawValue) {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const names = values.filter(item => typeof item === "string").flatMap(parseTagNames);
  return [...new Set(names)];
}

// Settings are written as JSON, but rows written before that are plain strings, so both
// shapes are read. Each caller supplies its own normaliser, which decides the empty value.
function parseStored(rawValue, normalize) {
  if (typeof rawValue !== 'string') return normalize(null);

  const trimmed = rawValue.trim();
  if (!trimmed) return normalize(null);

  try {
    return normalize(JSON.parse(trimmed));
  } catch {
    return normalize(trimmed);
  }
}

// Both lists are already clean: the stored order went through normalizeTagTypeOrder, and
// the available types come straight from the tags table.
function mergeTagTypeOrder(preferredOrder = [], availableTypes = []) {
  const merged = [...new Set([...preferredOrder, ...availableTypes])];
  return merged.length ? merged : [...DEFAULT_TAG_TYPE_ORDER];
}

function getAvailableTagTypes() {
  try {
    return getTagTypesStmt.all().map(row => row.type);
  } catch {
    return [];
  }
}

export function getMediaSettings() {
  const rows = getMediaRowsStmt.all();
  const settings = { ...MEDIA_SETTINGS_DEFAULTS };

  for (const row of rows) {
    const key = row.key.slice("media.".length);
    if (!MEDIA_SETTING_KEYS.has(key)) continue;
    settings[key] = isTrue(row.value);
  }

  return settings;
}

export function setMediaSettings(partialSettings) {
  const now = Date.now();
  const entries = Object.entries(partialSettings)
    .filter(([key]) => MEDIA_SETTING_KEYS.has(key))
    .map(([key, value]) => [`media.${key}`, value ? "1" : "0", now]);

  if (!entries.length) return getMediaSettings();

  const tx = db.transaction((rows) => {
    for (const row of rows) upsertSettingStmt.run(...row);
  });

  tx(entries);
  return getMediaSettings();
}

export function getBlacklistedTags() {
  try {
    const row = getSettingStmt.get(BLACKLISTED_TAGS_KEY);
    return parseStored(row?.value, normalizeTagNames);
  } catch {
    return [];
  }
}

export function setBlacklistedTags(rawTagString) {
  const tags = normalizeTagNames(rawTagString);

  upsertSettingStmt.run(
    BLACKLISTED_TAGS_KEY,
    JSON.stringify(tags),
    Date.now()
  );

  return tags;
}

export function getTagTypeOrder() {
  const availableTypes = getAvailableTagTypes();

  try {
    const row = getSettingStmt.get(TAG_TYPE_ORDER_KEY);
    const storedOrder = parseStored(row?.value, normalizeTagTypeOrder);
    const preferredOrder = storedOrder.length ? storedOrder : DEFAULT_TAG_TYPE_ORDER;
    return mergeTagTypeOrder(preferredOrder, availableTypes);
  } catch {
    return mergeTagTypeOrder(DEFAULT_TAG_TYPE_ORDER, availableTypes);
  }
}

export function setTagTypeOrder(rawTagTypeOrder) {
  const normalizedOrder = normalizeTagTypeOrder(rawTagTypeOrder);

  upsertSettingStmt.run(
    TAG_TYPE_ORDER_KEY,
    JSON.stringify(normalizedOrder),
    Date.now()
  );

  return getTagTypeOrder();
}

export function getTagTypeColors() {
  const availableTypes = getAvailableTagTypes();

  try {
    const row = getSettingStmt.get(TAG_TYPE_COLORS_KEY);
    const storedColors = parseStored(row?.value, normalizeTagTypeColors);
    return mergeTagTypeColors(storedColors, availableTypes);
  } catch {
    return mergeTagTypeColors({}, availableTypes);
  }
}

export function setTagTypeColors(rawTagTypeColors) {
  const availableTypes = getAvailableTagTypes();
  const normalizedColors = normalizeTagTypeColors(rawTagTypeColors);
  const sanitizedColors = mergeTagTypeColors(normalizedColors, availableTypes);

  upsertSettingStmt.run(
    TAG_TYPE_COLORS_KEY,
    JSON.stringify(sanitizedColors),
    Date.now()
  );

  return sanitizedColors;
}

export function getTagTypeOrderSql() {
  return buildTagTypeOrderSql(getTagTypeOrder());
}

export function getTagTypeColorsCss() {
  return buildTagTypeColorsCss(getTagTypeColors());
}
