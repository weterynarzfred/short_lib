import { useEffect, useState } from "react";
import classNames from "classnames";

import { updatePostNotesAction } from "@/lib/actions";

import styles from "./MediaPanelNotesEditor.module.scss";

export default function MediaPanelNotesEditor({
  postId,
  initialValue,
  onPatchPost,
  focusRef,
}) {
  const originalNotes = initialValue ?? "";
  const [notesValue, setNotesValue] = useState(originalNotes);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setNotesValue(originalNotes);
  }, [originalNotes]);

  const isNotesDirty = notesValue !== originalNotes;

  const saveNotes = async () => {
    if (!isNotesDirty) return;

    focusRef.current.blur();
    setIsSavingNotes(true);
    setSaveError("");
    try {
      const result = await updatePostNotesAction(postId, notesValue);
      if (result.ok === false) setSaveError(`save failed: ${result.error}`);
      else onPatchPost(postId, { notes_md: result.notes_md });
    } catch {
      setSaveError("save failed: no reason given, see the server log");
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
        ref={focusRef}
        id={`media-notes-${postId}`}
        className={classNames(styles.notesInput, {
          [styles.notesInputDirty]: isNotesDirty,
        })}
        value={notesValue}
        placeholder="notes"
        onChange={event => setNotesValue(event.target.value)}
        onKeyDown={event => {
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
    </div>

    {saveError ? <div className={styles.saveError}>{saveError}</div> : null}
  </div>;
}
