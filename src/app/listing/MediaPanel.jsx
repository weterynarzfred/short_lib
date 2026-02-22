import { useEffect, useMemo, useState, useTransition } from "react";
import { deletePostAction, updatePostTagsAction } from "@/lib/actions";
import styles from "./MediaPanel.module.scss";
import classNames from "classnames";

export default function MediaPanel({ post, close, prev, next, mediaRef }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [tagsValue, setTagsValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const originalTags = useMemo(
    () => post.tags.map((t) => t.name).join(" ").trim(),
    [post]
  );

  useEffect(() => {
    setTagsValue(originalTags);
  }, [originalTags]);

  const isDirty = tagsValue.trim() !== originalTags;

  const saveTags = () => {
    if (!isDirty) return;

    const nextValue = tagsValue.trim();

    startTransition(() => {
      updatePostTagsAction(post.id, nextValue);
    });
  };

  const resetTags = () => {
    setTagsValue(originalTags);
  };

  return (
    <div className={styles.MediaPanel}>
      <button className={styles.MediaPanel__close} onClick={close}>
        ×
      </button>

      <div className={styles.MediaPanel__media}>
        {post.mime_type.startsWith("image") && (
          <img
            src={`/api/media/${post.file_path}`}
            ref={mediaRef}
            tabIndex={0}
            alt=""
          />
        )}

        {post.mime_type.startsWith("video") && (
          <video
            src={`/api/media/${post.file_path}`}
            autoPlay
            controls
            onEnded={next}
            ref={mediaRef}
            tabIndex={0}
          />
        )}

        {post.mime_type.startsWith("audio") && (
          <audio
            src={`/api/media/${post.file_path}`}
            autoPlay
            controls
            onEnded={next}
            ref={mediaRef}
            tabIndex={0}
          />
        )}
      </div>

      <div className={styles.navigation}>
        <button className={styles.MediaPanel__prev} onClick={prev}>
          ←
        </button>
        <button className={styles.MediaPanel__next} onClick={next}>
          →
        </button>
      </div>

      <div className={styles.edit}>
        <textarea
          className={classNames(styles.tagList, { [styles.tagListDirty]: isDirty })}
          value={tagsValue}
          onChange={(e) => setTagsValue(e.target.value)}
        />

        <div className={styles.buttonList}>
          <button
            className={styles.button}
            type="button"
            onClick={saveTags}
            disabled={!isDirty || isPending}
          >
            {isPending ? "saving…" : "save tags"}
          </button>

          <button
            className={styles.button}
            type="button"
            onClick={resetTags}
            disabled={!isDirty || isPending}
          >
            reset
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        {!confirmingDelete && (
          <button
            className={styles.deleteButton}
            onClick={() => setConfirmingDelete(true)}
          >
            delete
          </button>
        )}

        {confirmingDelete && (
          <>
            <button
              className={styles.button}
              onClick={() => setConfirmingDelete(false)}
            >
              cancel
            </button>
            <button
              className={styles.deleteButton}
              onClick={async () => {
                await deletePostAction(post.id);
                setConfirmingDelete(false);
              }}
            >
              confirm
            </button>
          </>
        )}
      </div>
    </div>
  );
}
