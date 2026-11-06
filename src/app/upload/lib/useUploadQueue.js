"use client";

import { useCallback, useState } from "react";

function createUploadEntry(file) {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    progress: 0,
    done: false,
    failed: false,
    failureReason: "",
    mediaId: null,
    tagsValue: "",
    knownTags: [],
    isSavingTags: false,
    tagsSaveNote: "",
    notesValue: "",
    isSavingNotes: false,
    notesSaveNote: "",
  };
}

// An entry is settled once it has stopped transferring, either way.
export function isUploadSettled(upload) {
  return Boolean(upload?.done || upload?.failed);
}

function normalizeKnownTags(tags) {
  if (!Array.isArray(tags)) return [];

  return tags
    .map(tag => {
      const name = typeof tag?.name === "string" ? tag.name.trim() : "";
      if (!name) return null;

      const type = typeof tag?.type === "string" ? tag.type.trim() : "";
      return { name, type: type || "general" };
    })
    .filter(Boolean);
}

// Tags saved on the server come back as rows; the editor text is derived from them so the
// two cannot drift.
function tagFields(tags) {
  const knownTags = normalizeKnownTags(tags);
  return { knownTags, tagsValue: knownTags.map(tag => tag.name).join(" ") };
}

// A failed upload of a duplicate still previews the post that already holds the file.
function extractFailureData(xhr) {
  let payload = null;
  try {
    payload = JSON.parse(xhr.responseText);
  } catch {
    payload = null;
  }

  const existingPost = payload?.existingPost;

  return {
    failureReason: payload?.error ?? `Upload failed (${xhr.status})`,
    filePath: existingPost?.file_path ?? null,
    mime_type: existingPost?.mime_type ?? null,
  };
}

export default function useUploadQueue() {
  const [uploads, setUploads] = useState([]);

  const successUploads = uploads.filter(upload => upload.done && upload.mediaId);

  function updateUpload(uploadId, updater) {
    setUploads(prev => prev.map(upload =>
      upload.id === uploadId ? updater(upload) : upload
    ));
  }

  // One way to change an entry, rather than a named setter per field. Callers say what
  // they mean - `patchUpload(id, { isSavingTags: true, tagsSaveNote: "" })` - instead of
  // looking up which wrapper happens to clear the note too.
  function patchUpload(uploadId, patch) {
    updateUpload(uploadId, upload => ({ ...upload, ...patch }));
  }

  function markFailed(uploadId, failureReason, extra = {}) {
    patchUpload(uploadId, { failed: true, failureReason, ...extra });
  }

  function uploadFile(file) {
    const entry = createUploadEntry(file);
    setUploads(prev => [...prev, entry]);

    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return;

      const progress = Math.round((event.loaded / event.total) * 100);
      patchUpload(entry.id, { progress });
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        const { failureReason, ...preview } = extractFailureData(xhr);
        markFailed(entry.id, failureReason, preview);
        return;
      }

      const match = JSON.parse(xhr.responseText).uploaded[0];
      if (!match) {
        markFailed(entry.id, "Invalid server response");
        return;
      }

      patchUpload(entry.id, {
        progress: 100,
        done: true,
        mediaId: match.id,
        mime_type: match.mimeType,
        filePath: match.filePath,
        ...tagFields(match.tags),
      });
    };

    xhr.onerror = () => markFailed(entry.id, "Network error");
    xhr.onabort = () => markFailed(entry.id, "Upload canceled");
    xhr.send(form);
  }

  function uploadFiles(files) {
    [...files].forEach(uploadFile);
  }

  // Drops everything that has finished, keeping anything still transferring so a reset
  // can never lose a file mid-upload. Its XHR callbacks target entries by id, so a
  // removed entry simply stops being updated.
  //
  // Memoised because callers use it as an effect dependency.
  const clearSettledUploads = useCallback(() => {
    setUploads(prev => prev.filter(upload => !isUploadSettled(upload)));
  }, []);

  // Its own function because the tag editor passes an updater, and because typing must
  // clear the "saved" note.
  function setUploadTagsValue(uploadId, nextValue) {
    updateUpload(uploadId, upload => ({
      ...upload,
      tagsValue: typeof nextValue === "function"
        ? nextValue(upload.tagsValue)
        : nextValue,
      tagsSaveNote: "",
    }));
  }

  function setUploadKnownTags(uploadId, tags) {
    patchUpload(uploadId, { ...tagFields(tags), tagsSaveNote: "" });
  }

  function applyMediaTagValues(values) {
    const tagFieldsByMediaId = new Map(values.map(value => [value.mediaId, tagFields(value.tags)]));

    setUploads(prev => prev.map(upload => {
      const nextTagFields = tagFieldsByMediaId.get(upload.mediaId);
      if (!nextTagFields) return upload;

      return { ...upload, ...nextTagFields, tagsSaveNote: "" };
    }));
  }

  return {
    uploads,
    successUploads,
    uploadFiles,
    clearSettledUploads,
    patchUpload,
    setUploadTagsValue,
    setUploadKnownTags,
    applyMediaTagValues,
  };
}
