"use client";

import { useState } from "react";
import classNames from "classnames";

import ScoreInput from "@/components/ScoreInput";
import TagEditor from "@/components/TagEditor";
import { getTagTypeClassName } from "@/lib/tagTypeOrder";
import {
  deletePostsBulkAction,
  editPostTagsBulkAction,
  updatePostScoreBulkAction,
} from "@/lib/actions";

import styles from "./MediaPanelBulkTagEditor.module.scss";

// A rejection rather than a returned error means the action failed outside its own error
// handling (or never ran), so the reason is only in the server log.
const REQUEST_FAILED = "failed, see the server log";

// Every tag on the selected posts with how many of them carry it, most common first.
function countTags(posts) {
  const counts = new Map();
  for (const tag of posts.flatMap(post => post.tags)) {
    const entry = counts.get(tag.name) ?? { name: tag.name, type: tag.type, count: 0 };
    entry.count += 1;
    counts.set(tag.name, entry);
  }

  return [...counts.values()].sort((left, right) =>
    right.count - left.count || left.name.localeCompare(right.name));
}

export default function MediaPanelBulkTagEditor({
  postIds,
  posts,
  onClose,
  onPatchPost,
  onRemovePosts,
}) {
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingScore, setIsSavingScore] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [note, setNote] = useState("");

  const count = postIds.length;
  const isInputDisabled = count === 0 || isSaving || isDeleting;
  const canSave = value.trim().length > 0 && count > 0 && !isSaving && !isDeleting;
  const canDeleteAll = count > 0 && !isSaving && !isDeleting;
  const tagCounts = countTags(posts);

  // A tag every post has can only be removed, one only some have can only be added to the
  // rest, so a click fills in that token. Clicking again takes it back out.
  function toggleTagToken(tag) {
    const token = tag.count === posts.length ? `-${tag.name}` : tag.name;
    setValue(current => {
      const tokens = current.split(/\s+/).filter(Boolean);
      return tokens.includes(token)
        ? tokens.filter(existing => existing !== token).join(" ")
        : [...tokens, token].join(" ");
    });
  }

  // Sets every selected post to the clicked value rather than adjusting relatively, since
  // there is no single current score to adjust from.
  async function saveScore(nextScore) {
    if (!count || isSavingScore) return;

    setIsSavingScore(true);
    setNote("");

    try {
      const result = await updatePostScoreBulkAction(postIds, nextScore);
      if (result.ok === false) {
        setNote(`bulk score failed: ${result.error}`);
        return;
      }
      for (const postId of result.postIds)
        onPatchPost(postId, { score: result.score });
      setNote(`scored ${count} item(s)`);
    } catch {
      setNote(REQUEST_FAILED);
    } finally {
      setIsSavingScore(false);
    }
  }

  async function saveTags() {
    if (!canSave) return;

    setIsSaving(true);
    setNote("");

    try {
      const result = await editPostTagsBulkAction(postIds, value.trim());
      if (result.ok === false) {
        setNote(`bulk save failed: ${result.error}`);
        return;
      }
      for (const update of result.updates)
        onPatchPost(update.mediaId, { tags: update.tags });
      setValue("");
      setNote(`updated ${count} item(s)`);
    } catch {
      setNote(REQUEST_FAILED);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAll() {
    if (!canDeleteAll) return;

    setIsDeleting(true);
    setNote("");

    try {
      const result = await deletePostsBulkAction(postIds);
      onRemovePosts(result.deletedIds);
      if (result.ok === false) {
        setNote(`deleted ${result.deletedIds.length} of ${count}, then failed: ${result.error}`);
        return;
      }
      setValue("");
      setIsConfirmingDelete(false);
      setNote(`deleted ${count} item(s)`);
      onClose();
    } catch {
      setNote(REQUEST_FAILED);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className={styles.bulkTagEditor}>
      <div className={styles.header}>
        <h2>bulk selection</h2>
        <button
          type="button"
          className={styles.tagButton}
          onClick={onClose}
          disabled={isSaving || isDeleting}
          title="clear the selection (esc)"
        >done</button>
      </div>
      <div className={styles.subtitle}>{count} selected</div>

      {tagCounts.length > 0 && (
        <div className={styles.tagCounts}>
          {tagCounts.map(tag => (
            <button
              key={tag.name}
              type="button"
              className={styles.tagCount}
              onClick={() => toggleTagToken(tag)}
              disabled={isSaving || isDeleting}
              title={tag.count === posts.length ? "remove from all" : "add to the rest"}
            >
              <span className={getTagTypeClassName(tag.type) || undefined}>{tag.name}</span>
              {" "}
              <span className={styles.tagCountNumber}>{tag.count}/{posts.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className={styles.score}>
        <ScoreInput
          value={0}
          label="set score for selection"
          disabled={!count || isSaving || isDeleting || isSavingScore}
          onChange={saveScore}
        />
      </div>

      <div className={styles.edit}>
        <TagEditor
          postId={`listing-bulk-${count}`}
          value={value}
          setValue={setValue}
          saveTags={saveTags}
          inputProps={{
            className: styles.tagInput,
            placeholder: "tag to add, -tag to remove",
            disabled: isInputDisabled,
          }}
        />
        <div className={styles.tagActions}>
          <button
            type="button"
            className={styles.tagButton}
            onClick={saveTags}
            disabled={!canSave}
          >{isSaving ? "saving..." : "apply tags"}</button>
          <button
            type="button"
            className={styles.tagButton}
            onClick={() => {
              setValue("");
              setNote("");
            }}
            disabled={isSaving || isDeleting || !value}
          >clear</button>
          {note ? <div className={styles.tagNote}>{note}</div> : null}
          <div className={styles.saveHint}>ctrl + enter to save</div>
        </div>
      </div>

      {!isConfirmingDelete && (
        <button
          type="button"
          className={classNames(styles.tagButton, styles.deleteButton)}
          onClick={() => setIsConfirmingDelete(true)}
          disabled={!canDeleteAll}
        >delete all</button>
      )}

      {isConfirmingDelete && (
        <>
          <button
            type="button"
            className={styles.tagButton}
            onClick={() => setIsConfirmingDelete(false)}
            disabled={isDeleting}
          >cancel</button>
          <button
            type="button"
            className={classNames(styles.tagButton, styles.deleteButton)}
            onClick={deleteAll}
            disabled={!canDeleteAll}
          >{isDeleting ? "deleting..." : "confirm delete all"}</button>
        </>
      )}

      {/* A real form post, so the browser streams the zip to disk and shows its own
          progress. It lands in a hidden frame to keep the listing in place. */}
      <form
        className={styles.downloadForm}
        method="post"
        action="/api/download/bulk"
        target="bulk-download"
        onSubmit={() => setNote(`download of ${count} item(s) started`)}
      >
        <input type="hidden" name="postIds" value={postIds.join(",")} />
        <button type="submit" className={styles.tagButton} disabled={!count}>
          download all
        </button>
      </form>
      <iframe name="bulk-download" hidden />
    </div>
  );
}
