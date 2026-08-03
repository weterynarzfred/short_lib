import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import classNames from "classnames";

import {
  deletePostAction,
  updatePostOriginalFilenameAction,
  updatePostScoreAction,
  updatePostTagsAction,
} from "@/lib/actions";
import ScoreInput from "@/components/ScoreInput";
import TagEditor from "@/components/TagEditor";
import MediaPanelDownload from "./MediaPanelDownload";
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
  const tagFocusRef = useRef(null);
  const notesFocusRef = useRef(null);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [tagsValue, setTagsValue] = useState("");
  const [filenameValue, setFilenameValue] = useState("");
  const [isSavingTags, startTagsTransition] = useTransition();
  const [isSavingFilename, startFilenameTransition] = useTransition();
  const [isSavingScore, startScoreTransition] = useTransition();

  const originalTags = useMemo(
    () => post.tags.map(tag => tag.name).join(" ").trim(),
    [post.tags],
  );
  const originalFilename = useMemo(
    () => typeof post.original_filename === "string" ? post.original_filename : "",
    [post.original_filename],
  );

  useEffect(() => {
    function handleKeydown(event) {
      if (event.repeat) return;
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;
      if (event.key === "e") {
        event.preventDefault();
        tagFocusRef.current?.focus();
      } else if (event.key === "n") {
        event.preventDefault();
        notesFocusRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

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

    tagFocusRef.current?.blur();
    const nextValue = tagsValue.trim();
    startTagsTransition(() => {
      updatePostTagsAction(post.id, nextValue)
        .then(result => {
          if (Array.isArray(result?.tags)) onPatchPost?.(post.id, { tags: result.tags });
        })
        .catch(error => console.error(error));
    });
  };

  // Patched locally rather than revalidated, matching the other panel edits, so the panel
  // does not flicker while you click through ratings.
  const saveScore = nextScore => {
    if (nextScore === (post.score ?? 0)) return;

    startScoreTransition(() => {
      updatePostScoreAction(post.id, nextScore)
        .then(result => {
          if (Number.isInteger(result?.score)) onPatchPost?.(post.id, { score: result.score });
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

      <div className={styles.score}>
        <ScoreInput
          value={post.score}
          disabled={isSavingScore}
          onChange={saveScore}
        />
      </div>

      <div className={styles.edit}>
        <TagEditor
          postId={post.id}
          value={tagsValue}
          setValue={setTagsValue}
          saveTags={saveTags}
          knownTags={post.tags}
          focusRef={tagFocusRef}
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
        focusRef={notesFocusRef}
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

      <MediaPanelDownload post={post} />

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
