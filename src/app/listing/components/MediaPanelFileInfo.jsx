"use client";

import { useEffect, useState, useTransition } from "react";
import classNames from "classnames";

import { updatePostOriginalFilenameAction } from "@/lib/actions";
import { formatFileSize } from "../lib/postSubtitle";

import styles from "./MediaPanelFileInfo.module.scss";

// Everything about the file rather than the post: its name, its size, and whatever the
// format itself records. Collapsed by default because none of it matters while browsing,
// and the open state outlives the post, so it stays open while stepping through the listing.
export default function MediaPanelFileInfo({ post, onPatchPost }) {
  const [isOpen, setIsOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  const originalFilename = post.original_filename ?? "";
  const [filenameValue, setFilenameValue] = useState(originalFilename);
  const [isSaving, startSaving] = useTransition();
  // Tagged with its post: this component is not keyed, so it outlives arrowing on.
  const [saveFailure, setSaveFailure] = useState(null);

  useEffect(() => {
    setFilenameValue(originalFilename);
  }, [originalFilename]);

  // Read only once the section is open, and again per post while it stays open.
  useEffect(() => {
    if (!isOpen) return;

    let isCurrent = true;
    setRows(null);
    setError("");

    fetch(`/api/media/info?id=${post.id}`)
      .then(response => response.json())
      .then(payload => {
        if (!isCurrent) return;
        if (payload.error) setError(payload.error);
        else setRows(payload.rows);
      })
      .catch(() => {
        if (isCurrent) setError("Could not read this file's metadata");
      });

    return () => { isCurrent = false; };
  }, [isOpen, post.id]);

  const isDirty = filenameValue !== originalFilename;
  const fileSize = formatFileSize(post.file_size);

  function saveFilename() {
    if (!isDirty) return;

    const postId = post.id;
    setSaveFailure(null);
    startSaving(() => {
      updatePostOriginalFilenameAction(postId, filenameValue)
        .then(result => {
          if (result.ok === false) setSaveFailure({ postId, message: result.error });
          else onPatchPost(postId, { original_filename: result.original_filename });
        })
        .catch(() => setSaveFailure({ postId, message: "no reason given, see the server log" }));
    });
  }

  return (
    <details
      className={styles.fileInfo}
      open={isOpen}
      onToggle={event => setIsOpen(event.currentTarget.open)}
    >
      <summary className={styles.summary}>
        file info
        {fileSize ? <span className={styles.summarySize}>{fileSize}</span> : null}
      </summary>

      <div className={styles.filename}>
        <label className={styles.filenameLabel} htmlFor={`media-filename-${post.id}`}>
          filename
        </label>
        <input
          id={`media-filename-${post.id}`}
          className={classNames(styles.filenameInput, {
            [styles.filenameInputDirty]: isDirty,
          })}
          type="text"
          value={filenameValue}
          placeholder="original filename"
          onChange={event => setFilenameValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Escape") {
              event.stopPropagation();
              event.currentTarget.blur();
            } else if (event.key === "Enter") {
              event.preventDefault();
              saveFilename();
            }
          }}
        />
        <div className={styles.filenameButtons}>
          <button
            className={styles.button}
            type="button"
            onClick={saveFilename}
            disabled={!isDirty || isSaving}
          >{isSaving ? "saving..." : "save name"}</button>
          <button
            className={styles.button}
            type="button"
            onClick={() => setFilenameValue(originalFilename)}
            disabled={!isDirty || isSaving}
          >reset</button>
        </div>
        {saveFailure?.postId === post.id && (
          <div className={styles.error}>save failed: {saveFailure.message}</div>
        )}
      </div>

      {error ? <div className={styles.note}>{error}</div> : null}
      {!error && rows === null ? <div className={styles.note}>reading...</div> : null}
      {rows?.length === 0 ? <div className={styles.note}>nothing to report</div> : null}

      {rows?.length ? (
        <dl className={styles.rows}>
          {rows.map(row => (
            <div key={row.label} className={styles.row}>
              <dt className={styles.rowLabel}>{row.label}</dt>
              <dd className={classNames(styles.rowValue, { [styles.rowValueLong]: row.long })}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </details>
  );
}
