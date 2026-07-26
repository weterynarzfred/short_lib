import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  deleteTagAction,
  updateTagAction,
  addTagAliasAction,
  removeTagAliasAction,
  addTagImplicationAction,
  removeTagImplicationAction,
} from "@/lib/actions";
import { buildDraft } from "./tagTableUtils";

export default function useTagTableEditor({ tags }) {
  const router = useRouter();

  const [drafts, setDrafts] = useState({});
  const [editingTagId, setEditingTagId] = useState(null);
  const [confirmDeleteTagId, setConfirmDeleteTagId] = useState(null);
  const [pendingTagId, setPendingTagId] = useState(null);
  const [error, setError] = useState("");

  const tagsById = useMemo(() => {
    const next = new Map();
    for (const tag of tags) next.set(tag.id, tag);
    return next;
  }, [tags]);

  useEffect(() => {
    setDrafts(prev => {
      const next = {};
      for (const tag of tags) next[tag.id] = prev[tag.id] ?? buildDraft(tag);
      return next;
    });

    if (editingTagId && !tagsById.has(editingTagId)) setEditingTagId(null);
    if (confirmDeleteTagId && !tagsById.has(confirmDeleteTagId))
      setConfirmDeleteTagId(null);
  }, [tags, tagsById, editingTagId, confirmDeleteTagId]);

  const updateDraft = useCallback((tagId, patch) => {
    setDrafts(prev => ({
      ...prev,
      [tagId]: {
        ...prev[tagId],
        ...patch,
      },
    }));
  }, []);

  const getDraft = useCallback(tag => drafts[tag.id] ?? buildDraft(tag), [drafts]);

  const isDirty = useCallback((tag) => {
    const draft = getDraft(tag);
    return (
      draft.name.trim() !== tag.name ||
      (draft.type.trim() || "general") !== tag.type ||
      draft.description !== (tag.description ?? "")
    );
  }, [getDraft]);

  const runWithPending = useCallback(async (tagId, callback) => {
    setPendingTagId(tagId);
    setError("");

    try {
      const result = await callback();
      // Actions report rejection as data, since thrown messages are redacted in prod.
      if (result?.ok === false) {
        setError(result.error || "Action failed");
        return result;
      }

      router.refresh();
      return result;
    } catch (err) {
      setError(err?.message || "Action failed");
      return { ok: false };
    } finally {
      setPendingTagId(null);
    }
  }, [router]);

  const startEdit = useCallback((tag) => {
    setEditingTagId(tag.id);
    setConfirmDeleteTagId(null);
    setError("");
    setDrafts(prev => ({ ...prev, [tag.id]: prev[tag.id] ?? buildDraft(tag) }));
  }, []);

  const cancelEdit = useCallback((tag) => {
    setEditingTagId(null);
    setError("");
    setDrafts(prev => ({ ...prev, [tag.id]: buildDraft(tag) }));
  }, []);

  const saveEdit = useCallback(async (tag) => {
    const draft = getDraft(tag);
    const nextName = draft.name.trim();
    const nextType = draft.type.trim() || "general";
    const nextDescription = draft.description ?? "";

    if (!nextName) {
      setError("Tag name cannot be empty.");
      return;
    }

    return runWithPending(tag.id, async () => {
      const result = await updateTagAction(tag.id, { name: nextName, type: nextType, description: nextDescription });
      // Keep the editor open with the draft intact when the update was rejected.
      if (result?.ok === false) return result;

      setEditingTagId(null);
      setConfirmDeleteTagId(null);
      return result;
    });
  }, [getDraft, runWithPending]);

  const deleteTag = useCallback(async (tagId) => {
    return runWithPending(tagId, async () => {
      const result = await deleteTagAction(tagId);
      if (result?.ok === false) return result;

      setEditingTagId(null);
      setConfirmDeleteTagId(null);
      return result;
    });
  }, [runWithPending]);

  const addAlias = useCallback((tagId, aliasName) =>
    runWithPending(tagId, () => addTagAliasAction(tagId, aliasName)),
    [runWithPending]);

  const removeAlias = useCallback((tagId, aliasName) =>
    runWithPending(tagId, () => removeTagAliasAction(aliasName)),
    [runWithPending]);

  const addImplication = useCallback((tagId, impliedTagName) =>
    runWithPending(tagId, () => addTagImplicationAction(tagId, impliedTagName)),
    [runWithPending]);

  const removeImplication = useCallback((tagId, impliedTagId) =>
    runWithPending(tagId, () => removeTagImplicationAction(tagId, impliedTagId)),
    [runWithPending]);

  const handleEditKeyDown = useCallback((event, tag, isRowPending) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isRowPending) cancelEdit(tag);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (!isRowPending) void saveEdit(tag);
    }
  }, [cancelEdit, saveEdit]);

  return {
    editingTagId,
    confirmDeleteTagId,
    pendingTagId,
    error,
    setConfirmDeleteTagId,
    updateDraft,
    getDraft,
    isDirty,
    startEdit,
    cancelEdit,
    saveEdit,
    deleteTag,
    handleEditKeyDown,
    addAlias,
    removeAlias,
    addImplication,
    removeImplication,
  };
}
