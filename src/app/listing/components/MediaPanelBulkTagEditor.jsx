"use client";

import { useMemo, useState } from "react";
import classNames from "classnames";

import TagEditor from "@/components/TagEditor";
import { deletePostsBulkAction, editPostTagsBulkAction } from "@/lib/actions";

import styles from "./MediaPanelBulkTagEditor.module.scss";

export default function MediaPanelBulkTagEditor({
  postIds,
  className,
  onDeleteAll,
  onPatchPost,
}) {
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [note, setNote] = useState("");

  const uniquePostIds = useMemo(
    () => [...new Set((Array.isArray(postIds) ? postIds : []).filter(Number.isInteger))],
    [postIds]
  );
  const count = uniquePostIds.length;
  const isInputDisabled = count === 0 || isSaving || isDeleting;
  const canSave = value.trim().length > 0 && count > 0 && !isSaving && !isDeleting;
  const canDeleteAll = count > 0 && !isSaving && !isDeleting;
  const canDownload = count > 0 && !isDownloading;

  async function saveTags() {
    if (!canSave) return;

    setIsSaving(true);
    setNote("");

    try {
      const updates = await editPostTagsBulkAction(uniquePostIds, value.trim());
      if (Array.isArray(updates)) {
        for (const update of updates) {
          if (!Number.isInteger(update?.mediaId)) continue;
          if (!Array.isArray(update?.tags)) continue;
          onPatchPost?.(update.mediaId, { tags: update.tags });
        }
      }
      setValue("");
      setNote(`updated ${count} item(s)`);
    } catch {
      setNote("bulk save failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadAll() {
    if (!canDownload) return;

    setIsDownloading(true);
    setNote("");

    try {
      const res = await fetch("/api/download/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postIds: uniquePostIds }),
      });

      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "media.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setNote("download failed");
    } finally {
      setIsDownloading(false);
    }
  }

  async function deleteAll() {
    if (!canDeleteAll) return;

    setIsDeleting(true);
    setNote("");

    try {
      await deletePostsBulkAction(uniquePostIds);
      setValue("");
      setIsConfirmingDelete(false);
      setNote(`deleted ${count} item(s)`);
      onDeleteAll?.();
    } catch {
      setNote("bulk delete failed");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className={classNames(className, styles.bulkTagEditor)}>
      <h2>bulk selection</h2>
      <div className={styles.subtitle}>{count} selected</div>

      <div className={styles.edit}>
        <TagEditor
          postId={`listing-bulk-${count}`}
          value={value}
          setValue={setValue}
          saveTags={saveTags}
          inputProps={{
            className: styles.tagInput,
            placeholder: "tag to add, -tag to remove",
            disabled: isInputDisabled,
          }}
        />
        <div className={styles.tagActions}>
          <button
            type="button"
            className={styles.tagButton}
            onClick={saveTags}
            disabled={!canSave}
          >{isSaving ? "saving..." : "apply tags"}</button>
          <button
            type="button"
            className={styles.tagButton}
            onClick={() => {
              setValue("");
              setNote("");
            }}
            disabled={isSaving || isDeleting || !value}
          >clear</button>
          {note ? <div className={styles.tagNote}>{note}</div> : null}
          <div className={styles.saveHint}>ctrl + enter to save</div>
        </div>
      </div>

      {!isConfirmingDelete && (
        <button
          type="button"
          className={classNames(styles.tagButton, styles.deleteButton)}
          onClick={() => setIsConfirmingDelete(true)}
          disabled={!canDeleteAll}
        >delete all</button>
      )}

      {isConfirmingDelete && (
        <>
          <button
            type="button"
            className={styles.tagButton}
            onClick={() => setIsConfirmingDelete(false)}
            disabled={isDeleting}
          >cancel</button>
          <button
            type="button"
            className={classNames(styles.tagButton, styles.deleteButton)}
            onClick={deleteAll}
            disabled={!canDeleteAll}
          >{isDeleting ? "deleting..." : "confirm delete all"}</button>
        </>
      )}

      <button
        type="button"
        className={styles.tagButton}
        onClick={downloadAll}
        disabled={!canDownload}
      >{isDownloading ? "downloading..." : "download all"}</button>
    </div>
  );
}
