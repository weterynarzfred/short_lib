import { useEffect, useMemo, useState } from "react";
import classNames from "classnames";

import { updatePostNotesAction } from "@/lib/actions";

import styles from "./MediaPanelNotesEditor.module.scss";

export default function MediaPanelNotesEditor({ postId, initialValue, onPatchPost }) {
  const [notesValue, setNotesValue] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const originalNotes = useMemo(
    () => typeof initialValue === "string" ? initialValue : "",
    [initialValue]
  );

  useEffect(() => { setNotesValue(originalNotes); }, [originalNotes]);

  const isNotesDirty = notesValue !== originalNotes;

  const saveNotes = async () => {
    if (!isNotesDirty) return;

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
        id={`media-notes-${postId}`}
        className={classNames(styles.notesInput, {
          [styles.notesInputDirty]: isNotesDirty,
        })}
        value={notesValue}
        placeholder="notes"
        onChange={event => setNotesValue(event.target.value)}
        onKeyDown={event => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight")
            event.stopPropagation();
          else if (event.key === "Escape") {
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
  </div>;
}
