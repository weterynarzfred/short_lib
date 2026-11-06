import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import classNames from "classnames";

import {
  deletePostAction,
  updatePostScoreAction,
  updatePostTagsAction,
} from "@/lib/actions";
import isEditableTarget from "@/lib/isEditableTarget";
import mimetypeToType from "@/lib/mimetypeToType";
import ScoreInput from "@/components/ScoreInput";
import TagEditor from "@/components/TagEditor";
import MediaPanelDownload from "./MediaPanelDownload";
import MediaPanelFileInfo from "./MediaPanelFileInfo";
import MediaPanelNotesEditor from "./MediaPanelNotesEditor";

import styles from "./MediaPanelMeta.module.scss";

export default function MediaPanelMeta({
  post,
  prev,
  next,
  onPatchPost,
  onRemovePosts,
  isSlideshowOn,
}) {
  const tagFocusRef = useRef(null);
  const notesFocusRef = useRef(null);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [tagsValue, setTagsValue] = useState("");
  const [isSavingTags, startTagsTransition] = useTransition();
  const [isSavingScore, startScoreTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  // Tagged with the post they belong to, so a save that fails after arrowing on does not
  // show up under the next post.
  const [editFailure, setEditFailure] = useState(null);
  const [deleteFailure, setDeleteFailure] = useState(null);

  const originalTags = post.tags.map(tag => tag.name).join(" ").trim();

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

  // This component stays mounted while arrowing through posts. Neighbouring posts often share
  // a tag string, so reset on post.id too, and never carry a pending delete confirm over.
  useEffect(() => {
    setTagsValue(originalTags);
  }, [post.id, originalTags]);

  useEffect(() => {
    setIsConfirmingDelete(false);
  }, [post.id]);

  const isTagsDirty = tagsValue.trim() !== originalTags;

  // Every edit here works the same way: run the action in a transition, then patch the post
  // locally with what came back rather than revalidating, so the panel does not flicker
  // while you type or click through ratings.
  const save = (startTransition, action, toPatch) => {
    const postId = post.id;
    setEditFailure(null);
    startTransition(() => {
      action()
        .then(result => {
          if (result.ok === false) setEditFailure({ postId, message: result.error });
          else onPatchPost(postId, toPatch(result));
        })
        .catch(() => setEditFailure({ postId, message: "no reason given, see the server log" }));
    });
  };

  const confirmDelete = async () => {
    const postId = post.id;
    setIsDeleting(true);
    setDeleteFailure(null);

    try {
      const result = await deletePostAction(postId);
      if (result.ok === false) {
        setDeleteFailure({ postId, message: result.error });
        return;
      }
      onRemovePosts([postId]);
      setIsConfirmingDelete(false);
    } catch {
      setDeleteFailure({ postId, message: "no reason given, see the server log" });
    } finally {
      setIsDeleting(false);
    }
  };

  const saveTags = () => {
    if (!isTagsDirty) return;

    tagFocusRef.current?.blur();
    const nextValue = tagsValue.trim();
    save(
      startTagsTransition,
      () => updatePostTagsAction(post.id, nextValue),
      result => ({ tags: result.tags })
    );
  };

  const saveScore = nextScore => {
    if (nextScore === (post.score ?? 0)) return;

    save(
      startScoreTransition,
      () => updatePostScoreAction(post.id, nextScore),
      result => ({ score: result.score })
    );
  };

  return (
    <div className={styles.mediaPanelMeta}>
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

        {editFailure?.postId === post.id && (
          <div className={styles.error}>save failed: {editFailure.message}</div>
        )}
      </div>

      {/* Keyed so a draft never lands on the next post; FileInfo is left unkeyed on
          purpose to keep its open state. */}
      <MediaPanelNotesEditor
        key={`notes-${post.id}`}
        postId={post.id}
        initialValue={post.notes_md}
        onPatchPost={onPatchPost}
        focusRef={notesFocusRef}
      />

      <MediaPanelFileInfo post={post} onPatchPost={onPatchPost} />

      <MediaPanelDownload key={`download-${post.id}`} post={post} />

      <div className={styles.actions}>
        {["image", "video"].includes(mimetypeToType(post.mime_type)) && (
          <Link
            className={styles.linkButton}
            href={`/listing?search=${encodeURIComponent(`similar:${post.id}`)}`}
          >show similar</Link>
        )}

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
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "deleting..." : "confirm"}
            </button>
          </>
        )}
      </div>

      {deleteFailure?.postId === post.id && (
        <div className={styles.error}>delete failed: {deleteFailure.message}</div>
      )}
    </div>
  );
}
