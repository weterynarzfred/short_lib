import db from "@/lib/db";
import {
  buildTagTypeOrderSql,
  DEFAULT_TAG_TYPE_ORDER,
  mergeTagTypeOrder,
  normalizeTagTypeOrder,
  parseStoredTagTypeOrder,
} from "@/lib/tagTypeOrder";

export const MEDIA_SETTINGS_DEFAULTS = {
  autoplay: false,
  loop: false,
  slideshow: false,
  muted: false,
  fullscreen: false,
};
export const BLACKLISTED_TAGS_KEY = "listing.blacklisted_tags";
export const TAG_TYPE_ORDER_KEY = "listing.tag_type_order";

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
const getTagTypesStmt = db.prepare(`
  SELECT DISTINCT LOWER(TRIM(type)) AS type
  FROM tags
  WHERE TRIM(type) <> ''
  ORDER BY type COLLATE NOCASE ASC
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

function toStoredValue(value) {
  return value ? "1" : "0";
}

function parseTagNames(raw = "") {
  if (typeof raw !== "string") return [];

  return raw
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => {
      const idx = token.indexOf(":");
      if (idx > 0 && idx < token.length - 1)
        return token.slice(idx + 1).trim();

      return token;
    })
    .filter(Boolean);
}

function normalizeTagNames(rawValue) {
  const normalized = [];
  const seen = new Set();

  const pushName = value => {
    const name = String(value ?? "").trim();
    if (!name || seen.has(name)) return;

    seen.add(name);
    normalized.push(name);
  };

  if (Array.isArray(rawValue)) {
    for (const item of rawValue) {
      if (typeof item !== "string") continue;
      for (const name of parseTagNames(item))
        pushName(name);
    }
    return normalized;
  }

  if (typeof rawValue !== "string") return normalized;

  for (const name of parseTagNames(rawValue))
    pushName(name);

  return normalized;
}

function parseStoredTagNames(rawValue) {
  if (typeof rawValue !== "string") return [];

  const trimmed = rawValue.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    return normalizeTagNames(parsed);
  } catch { }

  return normalizeTagNames(trimmed);
}

function getAvailableTagTypes() {
  try {
    return getTagTypesStmt
      .all()
      .map(row => row?.type)
      .filter(type => typeof type === "string" && type.length > 0);
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
    .map(([key, value]) => [`media.${key}`, toStoredValue(Boolean(value)), now]);

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
    return parseStoredTagNames(row?.value);
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
    const storedOrder = parseStoredTagTypeOrder(row?.value);

    if (!storedOrder.length)
      return mergeTagTypeOrder(DEFAULT_TAG_TYPE_ORDER, availableTypes);

    return mergeTagTypeOrder(storedOrder, availableTypes);
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

export function getTagTypeOrderSql() {
  return buildTagTypeOrderSql(getTagTypeOrder());
}
