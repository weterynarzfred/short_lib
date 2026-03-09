"use client";

import TagEditor from "@/components/TagEditor";

import styles from "./UploadBulkTagPanel.module.scss";

export default function UploadBulkTagPanel({
  count,
  value,
  setValue,
  saveTags,
  isSaving,
  note,
}) {
  if (count <= 1) return null;

  return (
    <div className={styles.bulkTagPanel}>
      <TagEditor
        postId={`bulk-${count}`}
        value={value}
        setValue={setValue}
        saveTags={saveTags}
        inputProps={{
          className: styles.tagInput,
          placeholder: "tags for all uploads",
        }}
      />

      <div className={styles.tagActions}>
        <button
          type="button"
          className={styles.tagButton}
          onClick={saveTags}
          disabled={isSaving || !value.trim()}
        >{isSaving ? "saving..." : "save tags for all"}</button>
        {note ? <div className={styles.tagNote}>{note}</div> : null}
      </div>
    </div>
  );
}
