"use client";

import { useMemo, useState } from "react";

function createUploadEntry(file) {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    progress: 0,
    done: false,
    failed: false,
    failureReason: "",
    existingPost: null,
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

function buildTagEditorValue(tags) {
  return normalizeKnownTags(tags).map(tag => tag.name).join(" ");
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

export default function useUploadQueue() {
  const [uploads, setUploads] = useState([]);

  const successUploads = useMemo(
    () => uploads.filter(upload => upload.done && upload.mediaId),
    [uploads]
  );

  function updateUpload(uploadId, updater) {
    setUploads(prev => prev.map(upload =>
      upload.id === uploadId ? updater(upload) : upload
    ));
  }

  function markFailed(uploadId, failureReason = "Upload failed", extra = {}) {
    updateUpload(uploadId, upload => ({
      ...upload,
      failed: true,
      failureReason,
      ...extra,
    }));
  }

  function extractFailureData(xhr) {
    let payload = null;
    try {
      payload = JSON.parse(xhr.responseText);
    } catch {
      payload = null;
    }

    const fallbackReason = xhr.status === 0
      ? "Network error"
      : xhr.status >= 400
        ? `Upload failed (${xhr.status})`
        : "Upload failed";
    const failureReason = payload && typeof payload.error === "string"
      ? payload.error
      : fallbackReason;

    const existingPost = payload && typeof payload.existingPost === "object" && payload.existingPost
      ? payload.existingPost
      : null;
    const hasPreview = typeof existingPost?.file_path === "string" && typeof existingPost?.mime_type === "string";

    return {
      failureReason,
      existingPost,
      filePath: hasPreview ? existingPost.file_path : null,
      mime_type: hasPreview ? existingPost.mime_type : null,
    };
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
      updateUpload(entry.id, upload => ({ ...upload, progress }));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        const failure = extractFailureData(xhr);
        markFailed(entry.id, failure.failureReason, {
          existingPost: failure.existingPost,
          filePath: failure.filePath,
          mime_type: failure.mime_type,
        });
        return;
      }

      try {
        const res = JSON.parse(xhr.responseText);
        if (res.status !== "Upload finished") {
          markFailed(entry.id, typeof res?.error === "string" ? res.error : "Upload failed");
          return;
        }

        const uploaded = Array.isArray(res.uploaded) ? res.uploaded : null;
        const match = uploaded?.[0];
        if (!match || !Number.isInteger(match.id)) {
          markFailed(entry.id, "Invalid server response");
          return;
        }

        updateUpload(entry.id, upload => ({
          ...upload,
          progress: 100,
          done: true,
          mediaId: match.id,
          mime_type: match?.mimeType,
          filePath: match.filePath,
          tagsValue: buildTagEditorValue(match?.tags),
          knownTags: normalizeKnownTags(match?.tags),
        }));
      } catch {
        markFailed(entry.id, "Invalid server response");
      }
    };

    xhr.onerror = () => markFailed(entry.id, "Network error");
    xhr.onabort = () => markFailed(entry.id, "Upload canceled");
    xhr.send(form);
  }

  function uploadFiles(files) {
    [...files].forEach(uploadFile);
  }

  function setUploadTagsValue(uploadId, nextValue) {
    updateUpload(uploadId, upload => ({
      ...upload,
      tagsValue: typeof nextValue === "function"
        ? nextValue(upload.tagsValue)
        : nextValue,
      tagsSaveNote: "",
    }));
  }

  function setUploadTagSaving(uploadId, isSavingTags) {
    updateUpload(uploadId, upload => ({
      ...upload,
      isSavingTags,
      tagsSaveNote: isSavingTags ? "" : upload.tagsSaveNote,
    }));
  }

  function setUploadTagNote(uploadId, tagsSaveNote) {
    updateUpload(uploadId, upload => ({ ...upload, tagsSaveNote }));
  }

  function setUploadKnownTags(uploadId, tags) {
    const normalizedTags = normalizeKnownTags(tags);

    updateUpload(uploadId, upload => ({
      ...upload,
      knownTags: normalizedTags,
      tagsValue: buildTagEditorValue(normalizedTags),
      tagsSaveNote: "",
    }));
  }

  function setUploadNotesValue(uploadId, nextValue) {
    updateUpload(uploadId, upload => ({
      ...upload,
      notesValue: nextValue,
      notesSaveNote: "",
    }));
  }

  function setUploadNoteSaving(uploadId, isSavingNotes) {
    updateUpload(uploadId, upload => ({ ...upload, isSavingNotes }));
  }

  function setUploadNoteNote(uploadId, notesSaveNote) {
    updateUpload(uploadId, upload => ({ ...upload, notesSaveNote }));
  }

  function applyMediaTagValues(values) {
    const tagDataByMediaId = new Map(
      (Array.isArray(values) ? values : [])
        .filter(value => Number.isInteger(value?.mediaId))
        .map(value => {
          const knownTags = normalizeKnownTags(value?.tags);
          return [value.mediaId, { knownTags, tagsValue: buildTagEditorValue(knownTags) }];
        })
    );

    if (!tagDataByMediaId.size) return;

    setUploads(prev => prev.map(upload => {
      const nextTagData = tagDataByMediaId.get(upload.mediaId);
      if (!nextTagData) return upload;

      return {
        ...upload,
        tagsValue: nextTagData.tagsValue,
        knownTags: nextTagData.knownTags,
        tagsSaveNote: "",
      };
    }));
  }

  return {
    uploads,
    successUploads,
    uploadFiles,
    setUploadTagsValue,
    setUploadTagSaving,
    setUploadTagNote,
    setUploadKnownTags,
    setUploadNotesValue,
    setUploadNoteSaving,
    setUploadNoteNote,
    applyMediaTagValues,
  };
}
