"use client";

import { useState, useTransition } from "react";

import { updateMediaSettingsAction } from "@/lib/actions";
import SettingActions from "./SettingActions";

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
  {
    key: "info",
    label: "info",
    description: "show the info panel next to fullscreen media",
  },
];

function normalizeSettings(raw) {
  const normalized = {};

  for (const item of MEDIA_SETTING_DEFS)
    normalized[item.key] = Boolean(raw[item.key]);

  return normalized;
}

function diffSettings(nextSettings, prevSettings) {
  const diff = {};

  for (const { key } of MEDIA_SETTING_DEFS) {
    if (nextSettings[key] !== prevSettings[key])
      diff[key] = nextSettings[key];
  }

  return diff;
}

export default function MediaSettingsSetting({ initialSettings }) {
  const normalizedInitial = normalizeSettings(initialSettings);

  const [settings, setSettings] = useState(normalizedInitial);
  const [savedSettings, setSavedSettings] = useState(normalizedInitial);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const changes = diffSettings(settings, savedSettings);
  const isDirty = Object.keys(changes).length > 0;

  function saveSettings() {
    setStatus("");
    setError("");

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

      <SettingActions
        isDirty={isDirty}
        isPending={isPending}
        onSave={saveSettings}
        onReset={() => {
          setSettings(savedSettings);
          setStatus("");
          setError("");
        }}
        status={status}
        error={error}
      />
    </div>
  );
}
