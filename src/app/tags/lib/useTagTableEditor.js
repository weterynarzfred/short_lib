import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { deleteTagAction, updateTagAction } from "@/lib/actions";
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
      (draft.type.trim() || "general") !== tag.type
    );
  }, [getDraft]);

  const runWithPending = useCallback(async (tagId, callback) => {
    setPendingTagId(tagId);
    setError("");

    try {
      await callback();
      router.refresh();
    } catch (err) {
      setError(err?.message || "Action failed");
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

    if (!nextName) {
      setError("Tag name cannot be empty.");
      return;
    }

    await runWithPending(tag.id, async () => {
      await updateTagAction(tag.id, { name: nextName, type: nextType });
      setEditingTagId(null);
      setConfirmDeleteTagId(null);
    });
  }, [getDraft, runWithPending]);

  const deleteTag = useCallback(async (tagId) => {
    await runWithPending(tagId, async () => {
      await deleteTagAction(tagId);
      setEditingTagId(null);
      setConfirmDeleteTagId(null);
    });
  }, [runWithPending]);

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
  };
}
