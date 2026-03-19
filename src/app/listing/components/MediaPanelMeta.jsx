import { useEffect, useMemo, useState, useTransition } from "react";
import classNames from "classnames";

import {
  deletePostAction,
  updatePostOriginalFilenameAction,
  updatePostTagsAction,
} from "@/lib/actions";
import TagEditor from "@/components/TagEditor";
import MediaPanelNotesEditor from "./MediaPanelNotesEditor";

import styles from "./MediaPanelMeta.module.scss";

export default function MediaPanelMeta({
  post,
  prev,
  next,
  onPatchPost,
  className,
  isSlideshowOn = false,
}) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [tagsValue, setTagsValue] = useState("");
  const [filenameValue, setFilenameValue] = useState("");
  const [isSavingTags, startTagsTransition] = useTransition();
  const [isSavingFilename, startFilenameTransition] = useTransition();

  const originalTags = useMemo(
    () => post.tags.map(tag => tag.name).join(" ").trim(),
    [post.tags],
  );
  const originalFilename = useMemo(
    () => typeof post.original_filename === "string" ? post.original_filename : "",
    [post.original_filename],
  );

  useEffect(() => {
    setTagsValue(originalTags);
  }, [originalTags]);
  useEffect(() => {
    setFilenameValue(originalFilename);
  }, [originalFilename]);

  const isTagsDirty = tagsValue.trim() !== originalTags;
  const isFilenameDirty = filenameValue !== originalFilename;

  const saveTags = () => {
    if (!isTagsDirty) return;

    const nextValue = tagsValue.trim();
    startTagsTransition(() => {
      updatePostTagsAction(post.id, nextValue)
        .then(result => {
          if (Array.isArray(result?.tags)) onPatchPost?.(post.id, { tags: result.tags });
        })
        .catch(error => console.error(error));
    });
  };

  const saveFilename = () => {
    if (!isFilenameDirty) return;

    startFilenameTransition(() => {
      updatePostOriginalFilenameAction(post.id, filenameValue)
        .then(result => {
          if (typeof result?.original_filename === "string")
            onPatchPost?.(post.id, { original_filename: result.original_filename });
        })
        .catch(error => console.error(error));
    });
  };

  return (
    <div className={classNames(className, styles.mediaPanelMeta)}>
      <div className={styles.navigation}>
        <button type="button" className={styles.navButton} onClick={prev}>
          {"\u2190"}
        </button>
        <button
          type="button"
          className={classNames(styles.navButton, {
            [styles.navButtonSlideshow]: isSlideshowOn,
          })}
          onClick={next}
        >
          {"\u2192"}
        </button>
      </div>

      <div className={styles.edit}>
        <TagEditor
          postId={post.id}
          value={tagsValue}
          setValue={setTagsValue}
          saveTags={saveTags}
          inputProps={{
            className: classNames(styles.tagList, {
              [styles.tagListDirty]: isTagsDirty,
            }),
            placeholder: "tags",
          }}
        />

        <div className={styles.buttonList}>
          <button
            className={styles.button}
            type="button"
            onClick={saveTags}
            disabled={!isTagsDirty || isSavingTags}
          >
            {isSavingTags ? "saving..." : "save tags"}
          </button>

          <button
            className={styles.button}
            type="button"
            onClick={() => setTagsValue(originalTags)}
            disabled={!isTagsDirty || isSavingTags}
          >
            reset
          </button>

          <div className={styles.saveNote}>ctrl + enter to save</div>
        </div>
      </div>

      <MediaPanelNotesEditor
        postId={post.id}
        initialValue={post.notes_md}
        onPatchPost={onPatchPost}
      />

      <div className={styles.edit}>
        <div className={styles.filename}>
          <div>
            <label
              className={styles.filenameLabel}
              htmlFor={`media-filename-${post.id}`}
            >
              filename
            </label>
            <input
              id={`media-filename-${post.id}`}
              className={classNames(styles.filenameInput, {
                [styles.filenameInputDirty]: isFilenameDirty,
              })}
              type="text"
              value={filenameValue}
              placeholder="original filename"
              onChange={event => setFilenameValue(event.target.value)}
              onKeyDown={event => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.stopPropagation();
                } else if (event.key === "Escape") {
                  event.stopPropagation();
                  event.currentTarget.blur();
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  saveFilename();
                }
              }}
            />
          </div>
          <div className={styles.filenameButtonList}>
            <button
              className={styles.button}
              type="button"
              onClick={saveFilename}
              disabled={!isFilenameDirty || isSavingFilename}
            >
              {isSavingFilename ? "saving..." : "save name"}
            </button>
            <button
              className={styles.button}
              type="button"
              onClick={() => setFilenameValue(originalFilename)}
              disabled={!isFilenameDirty || isSavingFilename}
            >
              reset
            </button>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        {!isConfirmingDelete && (
          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => setIsConfirmingDelete(true)}
          >
            delete
          </button>
        )}

        {isConfirmingDelete && (
          <>
            <button
              type="button"
              className={styles.button}
              onClick={() => setIsConfirmingDelete(false)}
            >
              cancel
            </button>
            <button
              type="button"
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
    </div>
  );
}
