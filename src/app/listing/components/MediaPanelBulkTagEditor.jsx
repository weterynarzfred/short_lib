"use client";

import { useMemo, useState } from "react";
import classNames from "classnames";

import TagEditor from "@/components/TagEditor";
import { deletePostsBulkAction, editPostTagsBulkAction } from "@/lib/actions";

import styles from "./MediaPanelBulkTagEditor.module.scss";

export default function MediaPanelBulkTagEditor({ postIds, className, onDeleteAll }) {
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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

  async function saveTags() {
    if (!canSave) return;

    setIsSaving(true);
    setNote("");

    try {
      await editPostTagsBulkAction(uniquePostIds, value.trim());
      setValue("");
      setNote(`updated ${count} item(s)`);
    } catch {
      setNote("bulk save failed");
    } finally {
      setIsSaving(false);
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
      <h2>bulk tag edit</h2>
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
    </div>
  );
}
