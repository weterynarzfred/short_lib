import { useEffect, useState } from "react";
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

  useEffect(() => {
    setDrafts(prev => {
      const next = {};
      for (const tag of tags) next[tag.id] = prev[tag.id] ?? buildDraft(tag);
      return next;
    });

    const ids = new Set(tags.map(tag => tag.id));
    setEditingTagId(id => ids.has(id) ? id : null);
    setConfirmDeleteTagId(id => ids.has(id) ? id : null);
  }, [tags]);

  function updateDraft(tagId, patch) {
    setDrafts(prev => ({
      ...prev,
      [tagId]: {
        ...prev[tagId],
        ...patch,
      },
    }));
  }

  const getDraft = tag => drafts[tag.id] ?? buildDraft(tag);

  function isDirty(tag) {
    const draft = getDraft(tag);
    return (
      draft.name.trim() !== tag.name ||
      (draft.type.trim() || "general") !== tag.type ||
      draft.description !== (tag.description ?? "")
    );
  }

  async function runWithPending(tagId, callback) {
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
  }

  function startEdit(tag) {
    setEditingTagId(tag.id);
    setConfirmDeleteTagId(null);
    setError("");
    setDrafts(prev => ({ ...prev, [tag.id]: prev[tag.id] ?? buildDraft(tag) }));
  }

  function cancelEdit(tag) {
    setEditingTagId(null);
    setError("");
    setDrafts(prev => ({ ...prev, [tag.id]: buildDraft(tag) }));
  }

  async function saveEdit(tag) {
    const draft = getDraft(tag);
    const nextName = draft.name.trim();
    const nextType = draft.type.trim() || "general";

    if (!nextName) {
      setError("Tag name cannot be empty.");
      return;
    }

    return runWithPending(tag.id, async () => {
      const result = await updateTagAction(tag.id, { name: nextName, type: nextType, description: draft.description });
      // Keep the editor open with the draft intact when the update was rejected.
      if (result?.ok === false) return result;

      setEditingTagId(null);
      setConfirmDeleteTagId(null);
      return result;
    });
  }

  function deleteTag(tagId) {
    return runWithPending(tagId, async () => {
      const result = await deleteTagAction(tagId);
      if (result?.ok === false) return result;

      setEditingTagId(null);
      setConfirmDeleteTagId(null);
      return result;
    });
  }

  const addAlias = (tagId, aliasName) =>
    runWithPending(tagId, () => addTagAliasAction(tagId, aliasName));

  const removeAlias = (tagId, aliasName) =>
    runWithPending(tagId, () => removeTagAliasAction(aliasName));

  const addImplication = (tagId, impliedTagName) =>
    runWithPending(tagId, () => addTagImplicationAction(tagId, impliedTagName));

  const removeImplication = (tagId, impliedTagId) =>
    runWithPending(tagId, () => removeTagImplicationAction(tagId, impliedTagId));

  function handleEditKeyDown(event, tag, isRowPending) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isRowPending) cancelEdit(tag);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (!isRowPending) saveEdit(tag);
    }
  }

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
