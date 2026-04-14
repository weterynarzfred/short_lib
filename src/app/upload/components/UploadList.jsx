"use client";

import classNames from "classnames";

import TagEditor from "@/components/TagEditor";
import MediaPreview from "@/components/MediaPreview";

import styles from "./UploadList.module.scss";

export default function UploadList({
  uploads,
  setUploadTagsValue,
  saveUploadTags,
  setUploadNotesValue,
  saveUploadNotes,
}) {
  return (
    <div className={styles.uploadList}>
      {uploads.map(file => (
        <div
          key={file.id}
          className={classNames(styles.item, {
            [styles.itemDone]: file.done,
            [styles.itemFailed]: file.failed,
          })}
        >
          {file.filePath && file.mime_type ? (
            <MediaPreview
              src={file.filePath}
              mime_type={file.mime_type}
              settings={{
                loop: true,
                muted: true,
                autoplay: false,
              }}
              className={styles.preview}
            />
          ) : null}

          <div className={styles.itemHeader}>
            <div className={styles.progressWrapper}>
              {file.done ? <div className={styles.progressDone}>{"\u2713"}</div> : null}
              {file.failed ? <div className={styles.progressFailed}>{"\u2715"}</div> : null}
              <div className={styles.progress}>
                <div
                  className={styles.progressBar}
                  style={{ width: file.progress + "%" }}
                />
              </div>
            </div>
            <div className={styles.fileName}>{file.name}</div>
            {file.failed && file.failureReason ? (
              <div className={styles.failureReason}>{file.failureReason}</div>
            ) : null}
          </div>

          {file.done && file.mediaId ? (
            <div className={styles.itemTagPanel}>
              <TagEditor
                postId={file.mediaId}
                value={file.tagsValue}
                setValue={nextValue => setUploadTagsValue(file.id, nextValue)}
                saveTags={() => saveUploadTags(file.id)}
                knownTags={file.knownTags}
                inputProps={{
                  className: styles.tagInput,
                  placeholder: "tags",
                }}
              />

              <div className={styles.tagActions}>
                <button
                  type="button"
                  className={styles.tagButton}
                  onClick={() => saveUploadTags(file.id)}
                  disabled={file.isSavingTags || !file.tagsValue.trim()}
                >
                  {file.isSavingTags ? "saving..." : "save tags"}
                </button>
                {file.tagsSaveNote ? (
                  <div className={styles.tagNote}>{file.tagsSaveNote}</div>
                ) : null}
              </div>

              <textarea
                className={styles.tagInput}
                placeholder="notes"
                value={file.notesValue}
                onChange={e => setUploadNotesValue(file.id, e.target.value)}
                onKeyDown={e => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    saveUploadNotes(file.id);
                  }
                }}
              />

              <div className={styles.tagActions}>
                <button
                  type="button"
                  className={styles.tagButton}
                  onClick={() => saveUploadNotes(file.id)}
                  disabled={file.isSavingNotes}
                >
                  {file.isSavingNotes ? "saving..." : "save notes"}
                </button>
                {file.notesSaveNote ? (
                  <div className={styles.tagNote}>{file.notesSaveNote}</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
