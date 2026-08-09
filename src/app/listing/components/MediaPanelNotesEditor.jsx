import { useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";

import { updatePostNotesAction } from "@/lib/actions";

import styles from "./MediaPanelNotesEditor.module.scss";

export default function MediaPanelNotesEditor({
  postId,
  initialValue,
  onPatchPost,
  focusRef,
  canDescribe = false,
}) {
  const textareaRef = useRef(null);
  const [notesValue, setNotesValue] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isDescribing, setIsDescribing] = useState(false);
  const [describeError, setDescribeError] = useState("");

  const originalNotes = useMemo(
    () => typeof initialValue === "string" ? initialValue : "",
    [initialValue]
  );

  useEffect(() => {
    setNotesValue(originalNotes);
    setDescribeError("");
  }, [originalNotes]);

  const isNotesDirty = notesValue !== originalNotes;

  // Appended as an unsaved draft rather than written straight to the post: the model is
  // worth reading before it becomes something `notes:` searches against.
  const describe = async () => {
    setIsDescribing(true);
    setDescribeError("");

    try {
      const response = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postId }),
      });
      const payload = await response.json();

      if (payload?.error) setDescribeError(payload.error);
      else setNotesValue(current => current.trim()
        ? `${current.trim()}\n\n${payload.text}`
        : payload.text);
    } catch {
      setDescribeError("Could not reach the describe service");
    } finally {
      setIsDescribing(false);
    }
  };

  const saveNotes = async () => {
    if (!isNotesDirty) return;

    textareaRef.current?.blur();
    setIsSavingNotes(true);
    try {
      const result = await updatePostNotesAction(postId, notesValue);
      if (typeof result?.notes_md === "string")
        onPatchPost?.(postId, { notes_md: result.notes_md });
    } finally {
      setIsSavingNotes(false);
    }
  };

  return <div className={styles.notes}>
    <div>
      <label
        className={styles.notesLabel}
        htmlFor={`media-notes-${postId}`}
      >notes</label>
      <textarea
        ref={el => {
          textareaRef.current = el;
          if (focusRef) focusRef.current = el;
        }}
        id={`media-notes-${postId}`}
        className={classNames(styles.notesInput, {
          [styles.notesInputDirty]: isNotesDirty,
        })}
        value={notesValue}
        placeholder="notes"
        onChange={event => setNotesValue(event.target.value)}
        onKeyDown={event => {
          // Arrow keys used to be stopped here because they navigated between posts.
          // Navigation now ignores events aimed at a field, so no key needs special
          // handling just to keep the caret working.
          if (event.key === "Escape") {
            event.stopPropagation();
            event.currentTarget.blur();
          }
          else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            saveNotes();
          }
        }}
      />
    </div>

    <div className={styles.buttonList}>
      <button
        className={styles.button}
        type="button"
        onClick={saveNotes}
        disabled={!isNotesDirty || isSavingNotes}
      >{isSavingNotes ? "saving..." : "save notes"}</button>

      <button
        className={styles.button}
        type="button"
        onClick={() => setNotesValue(originalNotes)}
        disabled={!isNotesDirty || isSavingNotes}
      >reset</button>

      {canDescribe ? (
        <button
          className={styles.button}
          type="button"
          onClick={describe}
          disabled={isDescribing || isSavingNotes}
          // The first press after an idle period waits out a 19 GB model load.
          title="describe this image with the local vision model"
        >{isDescribing ? "describing..." : "describe"}</button>
      ) : null}
    </div>

    {describeError ? <div className={styles.describeError}>{describeError}</div> : null}
  </div>;
}
