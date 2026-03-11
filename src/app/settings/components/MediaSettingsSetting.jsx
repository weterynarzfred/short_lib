"use client";

import { useMemo, useState, useTransition } from "react";

import { updateMediaSettingsAction } from "@/lib/actions";

import styles from "../page.module.scss";

const MEDIA_SETTING_DEFS = [
  {
    key: "autoplay",
    label: "autoplay",
    description: "auto-start audio and video when opening a post",
  },
  {
    key: "loop",
    label: "loop",
    description: "repeat media playback when slideshow is off",
  },
  {
    key: "slideshow",
    label: "slideshow",
    description: "automatically move to the next post after playback",
  },
  {
    key: "muted",
    label: "muted",
    description: "start video and audio with mute enabled",
  },
  {
    key: "fullscreen",
    label: "fullscreen",
    description: "open the media panel in fullscreen mode by default",
  },
];

function normalizeSettings(raw = {}) {
  const normalized = {};

  for (const item of MEDIA_SETTING_DEFS)
    normalized[item.key] = Boolean(raw?.[item.key]);

  return normalized;
}

function settingsEqual(a, b) {
  return MEDIA_SETTING_DEFS.every(item => a[item.key] === b[item.key]);
}

function diffSettings(nextSettings, prevSettings) {
  const diff = {};

  for (const item of MEDIA_SETTING_DEFS) {
    const key = item.key;
    if (nextSettings[key] === prevSettings[key]) continue;

    diff[key] = nextSettings[key];
  }

  return diff;
}

export default function MediaSettingsSetting({ initialSettings = {} }) {
  const normalizedInitial = useMemo(
    () => normalizeSettings(initialSettings),
    [initialSettings]
  );

  const [settings, setSettings] = useState(normalizedInitial);
  const [savedSettings, setSavedSettings] = useState(normalizedInitial);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isDirty = !settingsEqual(settings, savedSettings);

  function saveSettings() {
    if (!isDirty || isPending) return;

    setStatus("");
    setError("");

    const changes = diffSettings(settings, savedSettings);

    startTransition(async () => {
      try {
        const result = await updateMediaSettingsAction(changes);
        const nextSavedSettings = normalizeSettings(result);

        setSettings(nextSavedSettings);
        setSavedSettings(nextSavedSettings);
        setStatus("saved");
      } catch {
        setError("failed to save setting");
      }
    });
  }

  return (
    <div className={styles.mediaSettingsEditor}>
      <div className={styles.mediaSettingsList}>
        {MEDIA_SETTING_DEFS.map(item => (
          <label key={item.key} className={styles.mediaSettingItem}>
            <input
              type="checkbox"
              checked={settings[item.key]}
              disabled={isPending}
              onChange={() => {
                setSettings(prev => ({
                  ...prev,
                  [item.key]: !prev[item.key],
                }));
                setStatus("");
                setError("");
              }}
            />

            <span className={styles.mediaSettingText}>
              <span className={styles.mediaSettingLabel}>{item.label}</span>
              <span className={styles.mediaSettingDescription}>{item.description}</span>
            </span>
          </label>
        ))}
      </div>

      <div className={styles.settingActions}>
        <button
          type="button"
          className={styles.settingButton}
          disabled={!isDirty || isPending}
          onClick={saveSettings}
        >{isPending ? "saving..." : "save"}</button>

        <button
          type="button"
          className={styles.settingButton}
          disabled={!isDirty || isPending}
          onClick={() => {
            setSettings(savedSettings);
            setStatus("");
            setError("");
          }}
        >reset</button>

        {status ? <div className={styles.statusOk}>{status}</div> : null}
        {error ? <div className={styles.statusError}>{error}</div> : null}
      </div>
    </div>
  );
}
