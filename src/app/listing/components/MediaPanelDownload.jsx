"use client";

import { useMemo, useState } from "react";

import {
  getPresetsForMimeType,
  resolveTrim,
  supportsTrim,
} from "@/lib/downloadPresets";

import styles from "./MediaPanelDownload.module.scss";

// A plain link rather than a fetch: the response is streamed as ffmpeg encodes, so letting
// the browser own the download avoids buffering the whole file in memory first.
export default function MediaPanelDownload({ post }) {
  const [preset, setPreset] = useState("original");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const presets = useMemo(
    () => getPresetsForMimeType(post.mime_type),
    [post.mime_type]
  );

  // Trimming re-encodes, so it cannot apply to the untouched original.
  const canTrim = supportsTrim(post.mime_type) && preset !== "original";
  const trim = canTrim ? resolveTrim(start, end) : null;
  const hasTrimInput = Boolean(start.trim() || end.trim());
  const isTrimInvalid = canTrim && hasTrimInput && !trim;

  const href = useMemo(() => {
    const params = new URLSearchParams({ id: String(post.id), preset });
    if (trim) {
      params.set("start", start.trim());
      if (end.trim()) params.set("end", end.trim());
    }

    return `/api/download/post?${params.toString()}`;
  }, [post.id, preset, trim, start, end]);

  return (
    <div className={styles.download}>
      <div className={styles.row}>
        <select
          className={styles.select}
          value={preset}
          onChange={event => setPreset(event.target.value)}
          aria-label="download format"
        >
          {presets.map(option => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>

        <a
          className={styles.button}
          href={isTrimInvalid ? undefined : href}
          download
          aria-disabled={isTrimInvalid || undefined}
        >download</a>
      </div>

      {supportsTrim(post.mime_type) ? (
        <div className={styles.row}>
          <input
            className={styles.timeInput}
            value={start}
            onChange={event => setStart(event.target.value)}
            placeholder="start"
            aria-label="trim start"
            disabled={!canTrim}
          />
          <input
            className={styles.timeInput}
            value={end}
            onChange={event => setEnd(event.target.value)}
            placeholder="end"
            aria-label="trim end"
            disabled={!canTrim}
          />
        </div>
      ) : null}

      {supportsTrim(post.mime_type) && !canTrim ? (
        <div className={styles.hint}>pick a format to trim</div>
      ) : null}

      {isTrimInvalid ? (
        <div className={styles.hint}>end must come after start (mm:ss or seconds)</div>
      ) : null}
    </div>
  );
}
