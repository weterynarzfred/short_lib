"use client";

import classNames from "classnames";

import TagEditor from "@/components/TagEditor";
import MediaPreview from "@/components/MediaPreview";

import styles from "./UploadList.module.scss";

export default function UploadList({
  uploads,
  setUploadTagsValue,
  saveUploadTags,
}) {
  console.log(uploads);

  return (
    <div className={styles.uploadList}>
      {uploads.map(file => <div
        key={file.id}
        className={classNames(styles.item, {
          [styles.itemDone]: file.done,
          [styles.itemFailed]: file.failed,
        })}
      >
        {file.filePath ? <MediaPreview
          src={file.filePath}
          mime_type={file.mime_type}
          settings={{
            loop: true,
            muted: true,
            autoplay: false,
          }}
          className={styles.MediaPreview}
        /> : null}

        <div className={styles.itemHeader}>
          <div className={styles.progressWrapper}>
            {file.done ? <div className={styles.progressDone}>✓</div> : null}
            {file.failed ? <div className={styles.progressFailed}>✕</div> : null}
            <div className={styles.progress}>
              <div
                className={styles.progressBar}
                style={{ width: file.progress + "%" }}
              />
            </div>
          </div>
          <div className={styles.fileName}>{file.name}</div>
        </div>

        {file.done && file.mediaId ? (
          <div className={styles.itemTagPanel}>
            <TagEditor
              postId={file.mediaId}
              value={file.tagsValue}
              setValue={nextValue => setUploadTagsValue(file.id, nextValue)}
              saveTags={() => saveUploadTags(file.id)}
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
                disabled={file.isSavingTags || !(typeof file.tagsValue === "string" ? file.tagsValue : "").trim()}
              >{file.isSavingTags ? "saving..." : "save tags"}</button>
              {file.tagsSaveNote ?
                <div className={styles.tagNote}>{file.tagsSaveNote}</div> :
                null}
            </div>
          </div>
        ) : null}
      </div>)}
    </div>
  );
}
