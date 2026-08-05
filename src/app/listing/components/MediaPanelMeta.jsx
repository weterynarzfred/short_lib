import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import classNames from "classnames";

import {
  deletePostAction,
  updatePostOriginalFilenameAction,
  updatePostScoreAction,
  updatePostTagsAction,
} from "@/lib/actions";
import formatBytes from "@/lib/formatBytes";
import isEditableTarget from "@/lib/isEditableTarget";
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
      if (isEditableTarget(event.target)) return;

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

  // Every edit here works the same way: run the action in a transition, then patch the post
  // locally with what came back rather than revalidating, so the panel does not flicker
  // while you type or click through ratings. `toPatch` returns null when the response is
  // not the shape it expects, which leaves the post untouched.
  const save = (startTransition, action, toPatch) => {
    startTransition(() => {
      action()
        .then(result => {
          const patch = toPatch(result);
          if (patch) onPatchPost?.(post.id, patch);
        })
        .catch(error => console.error(error));
    });
  };

  const saveTags = () => {
    if (!isTagsDirty) return;

    tagFocusRef.current?.blur();
    const nextValue = tagsValue.trim();
    save(
      startTagsTransition,
      () => updatePostTagsAction(post.id, nextValue),
      result => Array.isArray(result?.tags) ? { tags: result.tags } : null
    );
  };

  const saveScore = nextScore => {
    if (nextScore === (post.score ?? 0)) return;

    save(
      startScoreTransition,
      () => updatePostScoreAction(post.id, nextScore),
      result => Number.isInteger(result?.score) ? { score: result.score } : null
    );
  };

  const saveFilename = () => {
    if (!isFilenameDirty) return;

    save(
      startFilenameTransition,
      () => updatePostOriginalFilenameAction(post.id, filenameValue),
      result => typeof result?.original_filename === "string"
        ? { original_filename: result.original_filename }
        : null
    );
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
                // No arrow handling needed: navigation ignores events aimed at a field.
                if (event.key === "Escape") {
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

      {Number.isFinite(Number(post.file_size)) && Number(post.file_size) > 0 ? (
        // Guarded rather than always rendered: formatBytes reports "0 B" for a missing
        // size, which reads as a real measurement of an empty file.
        <div className={styles.fileSize}>
          <span className={styles.fileSizeLabel}>file size</span>
          <span>{formatBytes(post.file_size)}</span>
        </div>
      ) : null}

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
