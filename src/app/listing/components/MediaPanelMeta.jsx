import { useEffect, useMemo, useState, useTransition } from "react";
import classNames from "classnames";

import { deletePostAction, updatePostTagsAction } from "@/lib/actions";
import TagEditor from "@/components/TagEditor";

import styles from "./MediaPanelMeta.module.scss";

// TODO: add an input for changing the original_filename value
// TODO: order tags in the tag editor by type ("meta", "creator", "copyright",
// "character", "general", everything else) and then alphabetically
export default function MediaPanelMeta({ post, prev, next }) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [tagsValue, setTagsValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const originalTags = useMemo(
    () => post.tags.map(t => t.name).join(" ").trim(),
    [post]
  );

  useEffect(() => { setTagsValue(originalTags); }, [originalTags]);

  const isDirty = tagsValue.trim() !== originalTags;
  const saveTags = () => {
    if (!isDirty) return;

    const nextValue = tagsValue.trim();
    startTransition(() => { updatePostTagsAction(post.id, nextValue); });
  };

  const resetTags = () => {
    setTagsValue(originalTags);
  };

  return <div className={styles.MediaPanelMeta}>
    <div className={styles.navigation}>
      <button className={styles.MediaPanel__prev} onClick={prev}>←</button>
      <button className={styles.MediaPanel__next} onClick={next}>→</button>
    </div>

    <div className={styles.edit}>
      <TagEditor
        postId={post.id}
        value={tagsValue}
        setValue={setTagsValue}
        saveTags={saveTags}
        inputProps={{
          className: classNames(styles.tagList, { [styles.tagListDirty]: isDirty }),
          placeholder: "tags",
        }}
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

        <div className={styles.saveNote}>ctrl + enter to save</div>
      </div>
    </div>

    <div className={styles.actions}>
      {!isConfirmingDelete && (
        <button
          className={styles.deleteButton}
          onClick={() => setIsConfirmingDelete(true)}
        >
          delete
        </button>
      )}

      {isConfirmingDelete && (
        <>
          <button
            className={styles.button}
            onClick={() => setIsConfirmingDelete(false)}
          >
            cancel
          </button>
          <button
            className={styles.deleteButton}
            onClick={async () => {
              await deletePostAction(post.id);
              setIsConfirmingDelete(false);
            }}
          >
            confirm
          </button>
        </>
      )}
    </div>
  </div>;
}
