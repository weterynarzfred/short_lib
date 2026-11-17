import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import classNames from "classnames";

import { setPostChildrenAction } from "@/lib/actions";

import styles from "./MediaPanelChildren.module.scss";

// The listing becomes the whole set in order, with the clicked post open in the panel.
function setHref(parentId, postId) {
  return `/listing?search=${encodeURIComponent(`parent:${parentId}`)}&post=${postId}`;
}

export default function MediaPanelChildren({ post, onPatchPost }) {
  const originalValue = post.children.map(child => child.id).join(" ");
  const [value, setValue] = useState(originalValue);
  const [conflicts, setConflicts] = useState(null);
  const [error, setError] = useState("");
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    setValue(originalValue);
  }, [originalValue]);

  const isDirty = value.trim() !== originalValue;

  function save(reassign) {
    setError("");
    setConflicts(null);
    startSaving(async () => {
      try {
        const result = await setPostChildrenAction(post.id, value, { reassign });
        if (result.ok === false) setError(result.error);
        else if (result.conflicts.length) setConflicts(result.conflicts);
        else for (const { id, ...fields } of result.updates) onPatchPost(id, fields);
      } catch {
        setError("no reason given, see the server log");
      }
    });
  }

  if (post.parent_id != null) {
    return (
      <Link className={styles.parentLink} href={setHref(post.parent_id, post.parent_id)}>
        open parent #{post.parent_id}
      </Link>
    );
  }

  return (
    <div className={styles.children}>
      {post.children.length > 0 && (
        <div className={styles.strip}>
          {post.children.map(child => (
            <Link
              key={child.id}
              className={styles.child}
              href={setHref(post.id, child.id)}
              title={`#${child.id}`}
            >
              {child.thumb
                ? <img src={`/api/media/${child.file_path}?size=thumb`} alt={`#${child.id}`} />
                : `#${child.id}`}
            </Link>
          ))}
        </div>
      )}

      <details className={styles.editor}>
        <summary className={styles.summary}>children</summary>

        <textarea
          className={classNames(styles.input, { [styles.inputDirty]: isDirty })}
          value={value}
          placeholder="post ids, in order"
          aria-label="child post ids"
          onChange={event => {
            setValue(event.target.value);
            setConflicts(null);
          }}
          onKeyDown={event => {
            if (event.key === "Escape") {
              event.stopPropagation();
              event.currentTarget.blur();
            } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              if (isDirty) save(false);
            }
          }}
        />

        {conflicts ? (
          <div className={styles.confirm}>
            <div className={styles.note}>
              {conflicts.map(({ id, parentId }) => `#${id} is a child of #${parentId}`).join(", ")}.
              move {conflicts.length > 1 ? "them" : "it"} here?
            </div>
            <div className={styles.buttonList}>
              <button className={styles.button} type="button" disabled={isSaving} onClick={() => save(true)}>
                move
              </button>
              <button className={styles.button} type="button" onClick={() => setConflicts(null)}>
                cancel
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.buttonList}>
            <button className={styles.button} type="button" disabled={!isDirty || isSaving} onClick={() => save(false)}>
              {isSaving ? "saving..." : "save children"}
            </button>
            <button className={styles.button} type="button" disabled={!isDirty || isSaving} onClick={() => setValue(originalValue)}>
              reset
            </button>
          </div>
        )}

        {error && <div className={styles.error}>save failed: {error}</div>}
      </details>
    </div>
  );
}
