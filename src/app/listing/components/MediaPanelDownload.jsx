"use client";

import { useMemo, useState } from "react";

import {
  CRF_MAX,
  CRF_MIN,
  DEFAULT_CRF,
  DOWNLOAD_PRESETS,
  RATE_MODES,
  getPresetsForMimeType,
  resolveTrim,
  supportsTrim,
} from "@/lib/downloadPresets";

import InfoHint from "@/components/InfoHint";

import styles from "./MediaPanelDownload.module.scss";

// One hint covering both modes, since the control that opens it is the mode selector -
// explaining only the selected mode leaves you unable to read about the other one before
// choosing it.
const RATE_MODE_HINT = (
  <>
    <strong>quality (crf)</strong>
    <p>
      crf <code>0-63</code>, where lower means better quality and a bigger file. 32 is the
      default; around 20 is visually lossless and large; 50+ turns to mush; 0 is lossless
      and enormous. Starts downloading immediately.
    </p>

    <strong>target size</strong>
    <p>
      Two-pass and slow: the whole video is analysed before any of it is written, so
      nothing downloads until that finishes. Measured results landed between 0.87× and
      1.01× of the target, so aim slightly under if you have a hard limit.
    </p>
  </>
);

const TRIM_HINT = (
  <>
    <strong>trim</strong>
    <p>
      Accepts <code>SS</code>, <code>MM:SS</code> or <code>HH:MM:SS</code>. Leave the end
      empty to run to the end of the file. Cuts are frame-exact because the output is
      re-encoded rather than copied, which is also why trimming needs a format other than
      the original.
    </p>
  </>
);

// A plain link rather than a fetch: the response is streamed as ffmpeg encodes, so letting
// the browser own the download avoids buffering the whole file in memory first.
export default function MediaPanelDownload({ post }) {
  const [preset, setPreset] = useState("original");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  // Kept as a string so the field can be cleared while typing; the route clamps anyway.
  const [crf, setCrf] = useState(String(DEFAULT_CRF));
  const [dropAudio, setDropAudio] = useState(false);
  const [rateMode, setRateMode] = useState(RATE_MODES.crf);
  const [targetMb, setTargetMb] = useState("");

  const hasVideoOptions = DOWNLOAD_PRESETS[preset]?.videoOptions === true;
  const wantsTargetSize = hasVideoOptions && rateMode === RATE_MODES.size;
  const isTargetMissing = wantsTargetSize && !(Number(targetMb) > 0);

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

    if (hasVideoOptions) {
      if (dropAudio) params.set("noAudio", "1");

      if (wantsTargetSize) {
        params.set("mode", RATE_MODES.size);
        params.set("targetMb", targetMb.trim());
      } else {
        params.set("crf", crf.trim() || String(DEFAULT_CRF));
      }
    }

    return `/api/download/post?${params.toString()}`;
  }, [post.id, preset, trim, start, end, hasVideoOptions, crf, dropAudio, wantsTargetSize, targetMb]);

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
          href={isTrimInvalid || isTargetMissing ? undefined : href}
          download
          aria-disabled={isTrimInvalid || isTargetMissing || undefined}
        >download</a>
      </div>

      {hasVideoOptions ? (
        <div className={styles.row}>
          <select
            className={styles.select}
            value={rateMode}
            onChange={event => setRateMode(event.target.value)}
            aria-label="rate control"
          >
            <option value={RATE_MODES.crf}>quality (crf)</option>
            <option value={RATE_MODES.size}>target size</option>
          </select>

          <InfoHint content={RATE_MODE_HINT} label="about rate control" />

          {wantsTargetSize ? (
            <label className={styles.option} htmlFor={`download-size-${post.id}`}>
              <input
                id={`download-size-${post.id}`}
                className={styles.crfInput}
                type="number"
                min="0"
                step="any"
                value={targetMb}
                onChange={event => setTargetMb(event.target.value)}
              />
              MB
            </label>
          ) : (
            <label className={styles.option} htmlFor={`download-crf-${post.id}`}>
              crf
              <input
                id={`download-crf-${post.id}`}
                className={styles.crfInput}
                type="number"
                min={CRF_MIN}
                max={CRF_MAX}
                value={crf}
                onChange={event => setCrf(event.target.value)}
              />
            </label>
          )}

          <label className={styles.option}>
            <input
              type="checkbox"
              checked={dropAudio}
              onChange={event => setDropAudio(event.target.checked)}
            />
            no audio
          </label>
        </div>
      ) : null}

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

          <InfoHint content={TRIM_HINT} label="about trimming" />
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
