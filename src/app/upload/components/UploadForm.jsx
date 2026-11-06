"use client";

import { useEffect, useRef, useState } from "react";
import classNames from "classnames";

import {
  addPostTagsBulkAction,
  getPostTagValuesAction,
  updatePostTagsAction,
  updatePostNotesAction,
} from "@/lib/actions";
import { usePageReset } from "@/components/PageResetProvider";
import UploadBulkTagPanel from "./UploadBulkTagPanel";
import UploadList from "./UploadList";
import useUploadQueue from "../lib/useUploadQueue";

import styles from "./UploadForm.module.scss";

// A rejection rather than a returned error means the action failed outside its own error
// handling (or never ran), so the reason is only in the server log.
const REQUEST_FAILED = "save failed, see the server log";

export default function UploadForm() {
  const [dragDepth, setDragDepth] = useState(0);
  const [bulkTagsValue, setBulkTagsValue] = useState("");
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [bulkSaveNote, setBulkSaveNote] = useState("");
  const { resetToken } = usePageReset();
  const {
    uploads,
    successUploads,
    uploadFiles,
    clearSettledUploads,
    patchUpload,
    setUploadTagsValue,
    setUploadKnownTags,
    applyMediaTagValues,
  } = useUploadQueue();

  const inputRef = useRef(null);

  // Clicking "upload" in the nav while already here means starting a fresh batch. The
  // token only ever increments, so 0 is the initial render and never a reset.
  useEffect(() => {
    if (!resetToken) return;

    clearSettledUploads();
    setBulkTagsValue("");
    setBulkSaveNote("");
  }, [resetToken, clearSettledUploads]);

  function onDrop(event) {
    event.preventDefault();
    uploadFiles(event.dataTransfer.files);
    setDragDepth(0);
  }

  async function saveUploadTags({ id, mediaId, tagsValue }) {
    patchUpload(id, { isSavingTags: true, tagsSaveNote: "" });

    try {
      const result = await updatePostTagsAction(mediaId, tagsValue);
      if (result.ok === false) {
        patchUpload(id, { tagsSaveNote: `save failed: ${result.error}` });
        return;
      }
      setUploadKnownTags(id, result.tags);
      patchUpload(id, { tagsSaveNote: "saved" });
    } catch {
      patchUpload(id, { tagsSaveNote: REQUEST_FAILED });
    } finally {
      patchUpload(id, { isSavingTags: false });
    }
  }

  async function saveUploadNotes({ id, mediaId, notesValue }) {
    patchUpload(id, { isSavingNotes: true });

    try {
      const result = await updatePostNotesAction(mediaId, notesValue);
      patchUpload(id, {
        notesSaveNote: result.ok === false ? `save failed: ${result.error}` : "saved",
      });
    } catch {
      patchUpload(id, { notesSaveNote: REQUEST_FAILED });
    } finally {
      patchUpload(id, { isSavingNotes: false });
    }
  }

  async function saveBulkTags() {
    const mediaIds = successUploads.map(upload => upload.mediaId);

    setIsBulkSaving(true);
    setBulkSaveNote("");

    try {
      const result = await addPostTagsBulkAction(mediaIds, bulkTagsValue);
      if (result.ok === false) {
        setBulkSaveNote(`bulk save failed: ${result.error}`);
        return;
      }
      const refreshedValues = await getPostTagValuesAction(mediaIds);
      applyMediaTagValues(refreshedValues);
      setBulkTagsValue("");
      setBulkSaveNote(`saved for ${mediaIds.length} item(s)`);
    } catch {
      setBulkSaveNote(REQUEST_FAILED);
    } finally {
      setIsBulkSaving(false);
    }
  }

  return (
    <div className={styles.uploadForm}>
      <div className={`content ${styles.content}`}>
        <div
          className={classNames(
            styles.dropzone,
            { [styles.dropzoneDragging]: dragDepth > 0 }
          )}
          onDragEnter={event => {
            event.preventDefault();
            setDragDepth(value => value + 1);
          }}
          onDragLeave={event => {
            event.preventDefault();
            setDragDepth(value => value - 1);
          }}
          onDragOver={event => event.preventDefault()}
          onDrop={onDrop}
          onClick={() => inputRef.current.click()}
        >drop files here or click to upload</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={event => {
            uploadFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <UploadBulkTagPanel
          count={successUploads.length}
          value={bulkTagsValue}
          setValue={setBulkTagsValue}
          saveTags={saveBulkTags}
          isSaving={isBulkSaving}
          note={bulkSaveNote}
        />
      </div>

      <div className={`content content--full ${styles.contentWide}`}>
        <UploadList
          uploads={uploads}
          setUploadTagsValue={setUploadTagsValue}
          saveUploadTags={saveUploadTags}
          setUploadNotesValue={(uploadId, notesValue) =>
            patchUpload(uploadId, { notesValue, notesSaveNote: "" })}
          saveUploadNotes={saveUploadNotes}
        />
      </div>
    </div>
  );
}
