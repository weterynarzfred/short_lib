import { useEffect, useMemo, useState, useTransition } from "react";
import classNames from "classnames";

import { deletePostAction, updatePostTagsAction } from "@/lib/actions";

import styles from "./MediaPanelMeta.module.scss";

export default function MediaPanelMeta({ post, prev, next }) {
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

  return <div className={styles.MediaPanelMeta}>
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
  </div>;
}
