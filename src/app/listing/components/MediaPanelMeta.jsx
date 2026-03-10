import { useEffect, useMemo, useState, useTransition } from "react";
import classNames from "classnames";

import {
  deletePostAction,
  updatePostTagsAction,
} from "@/lib/actions";
import TagEditor from "@/components/TagEditor";
import MediaPanelNotesEditor from "./MediaPanelNotesEditor";

import styles from "./MediaPanelMeta.module.scss";

// TODO: add an input for changing the original_filename value
export default function MediaPanelMeta({ post, prev, next, isSlideshowOn = false }) {
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

  return <div className={styles.MediaPanelMeta}>
    <div className={styles.navigation}>
      <button className={styles.MediaPanel__prev} onClick={prev}>←</button>
      <button
        className={classNames(styles.MediaPanel__next, {
          [styles.MediaPanel__nextSlideshow]: isSlideshowOn,
        })}
        onClick={next}
      >→</button>
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
        >{isPending ? "saving…" : "save tags"}</button>

        <button
          className={styles.button}
          type="button"
          onClick={() => setTagsValue(originalTags)}
          disabled={!isDirty || isPending}
        >reset</button>

        <div className={styles.saveNote}>ctrl + enter to save</div>
      </div>
    </div>

    <MediaPanelNotesEditor
      postId={post.id}
      initialValue={post.notes_md}
    />

    <div className={styles.actions}>
      {!isConfirmingDelete && (
        <button
          className={styles.deleteButton}
          onClick={() => setIsConfirmingDelete(true)}
        >delete</button>
      )}

      {isConfirmingDelete && (
        <>
          <button
            className={styles.button}
            onClick={() => setIsConfirmingDelete(false)}
          >cancel</button>
          <button
            className={styles.deleteButton}
            onClick={async () => {
              await deletePostAction(post.id);
              setIsConfirmingDelete(false);
            }}
          >confirm</button>
        </>
      )}
    </div>
  </div>;
}
