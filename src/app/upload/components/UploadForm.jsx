"use client";

import { useRef, useState } from "react";
import classNames from "classnames";

import {
  addPostTagsBulkAction,
  getPostTagValuesAction,
  updatePostTagsAction,
} from "@/lib/actions";
import UploadBulkTagPanel from "./UploadBulkTagPanel";
import UploadList from "./UploadList";
import useUploadQueue from "../lib/useUploadQueue";

import styles from "./UploadForm.module.scss";

export default function UploadForm() {
  const [dragDepth, setDragDepth] = useState(0);
  const [bulkTagsValue, setBulkTagsValue] = useState("");
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [bulkSaveNote, setBulkSaveNote] = useState("");
  const {
    uploads,
    successUploads,
    uploadFiles,
    setUploadTagsValue,
    setUploadTagSaving,
    setUploadTagNote,
    applyMediaTagValues,
  } = useUploadQueue();

  const inputRef = useRef(null);

  function onDrop(event) {
    event.preventDefault();
    uploadFiles(event.dataTransfer.files);
    setDragDepth(0);
  }

  async function saveUploadTags(uploadId) {
    const upload = uploads.find(item => item.id === uploadId);
    if (!upload?.mediaId) return;
    const rawTagsValue =
      typeof upload.tagsValue === "string" ? upload.tagsValue : "";

    setUploadTagSaving(uploadId, true);

    try {
      await updatePostTagsAction(upload.mediaId, rawTagsValue);
      setUploadTagSaving(uploadId, false);
      setUploadTagNote(uploadId, "saved");
    } catch {
      setUploadTagSaving(uploadId, false);
      setUploadTagNote(uploadId, "save failed");
    }
  }

  async function saveBulkTags() {
    const mediaIds = successUploads.map(upload => upload.mediaId);
    if (!mediaIds.length) return;

    setIsBulkSaving(true);
    setBulkSaveNote("");

    try {
      await addPostTagsBulkAction(mediaIds, bulkTagsValue);
      const refreshedValues = await getPostTagValuesAction(mediaIds);
      applyMediaTagValues(refreshedValues);
      setBulkTagsValue("");
      setBulkSaveNote(`saved for ${mediaIds.length} item(s)`);
    } catch {
      setBulkSaveNote("bulk save failed");
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
          onClick={() => inputRef.current?.click()}
        >drop files here or click to upload</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={event => {
            uploadFiles(event.target.files || []);
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
        />
      </div>
    </div>
  );
}
