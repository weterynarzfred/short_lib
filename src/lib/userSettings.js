import db from "@/lib/db";

// TODO: add a separate page with all settings, media settings should still have
// a copy in the media panel
// TODO: add a blacklisted tags setting, input with tag suggestions

export const MEDIA_SETTINGS_DEFAULTS = {
  autoplay: false,
  loop: false,
  slideshow: false,
  muted: false,
  fullscreen: false,
};

const MEDIA_SETTING_KEYS = new Set(Object.keys(MEDIA_SETTINGS_DEFAULTS));

const getMediaRowsStmt = db.prepare(`
  SELECT key, value
  FROM user_settings
  WHERE key LIKE 'media.%'
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
