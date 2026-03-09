"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { deleteTagAction, updateTagAction } from "@/lib/actions";

import styles from "./TagTable.module.scss";

const columns = [
  { key: "name", label: "tag" },
  { key: "type", label: "type" },
  { key: "count", label: "posts" },
  { key: "actions", label: "actions" },
];

function nextOrder(currentOrder, columnKey) {
  const [currentKey, currentDir] = (currentOrder || "").split("_");
  if (currentKey !== columnKey) return `${columnKey}_desc`;
  return `${columnKey}_${currentDir === "asc" ? "desc" : "asc"}`;
}

function buildDraft(tag) {
  return {
    name: tag.name,
    type: tag.type,
  };
}

export default function TagTable({ tags, order }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

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

  const createSortHref = columnKey => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("order", nextOrder(order, columnKey));
    params.set("page", 1);
    return `${pathname}?${params.toString()}`;
  };

  const updateDraft = (tagId, patch) => {
    setDrafts(prev => ({
      ...prev,
      [tagId]: {
        ...prev[tagId],
        ...patch,
      },
    }));
  };

  const getDraft = tag => drafts[tag.id] ?? buildDraft(tag);

  const isDirty = tag => {
    const draft = getDraft(tag);
    return (
      draft.name.trim() !== tag.name ||
      (draft.type.trim() || "general") !== tag.type
    );
  };

  const runWithPending = async (tagId, callback) => {
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
  };

  const startEdit = tag => {
    setEditingTagId(tag.id);
    setConfirmDeleteTagId(null);
    setError("");
    setDrafts(prev => ({ ...prev, [tag.id]: prev[tag.id] ?? buildDraft(tag) }));
  };

  const cancelEdit = tag => {
    setEditingTagId(null);
    setError("");
    setDrafts(prev => ({ ...prev, [tag.id]: buildDraft(tag) }));
  };

  const saveEdit = async tag => {
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
  };

  const deleteTag = async tagId => {
    await runWithPending(tagId, async () => {
      await deleteTagAction(tagId);
      setEditingTagId(null);
      setConfirmDeleteTagId(null);
    });
  };

  const handleEditKeyDown = (event, tag, isRowPending) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!isRowPending) cancelEdit(tag);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (!isRowPending) void saveEdit(tag);
    }
  };

  return (
    <>
      {error && <p className={styles.error}>{error}</p>}
      <table className={styles.TagTable}>
        <thead>
          <tr>
            {columns.map(col => {
              if (col.key === "actions")
                return <th key={col.key}>{col.label}</th>;

              const isSort = order?.startsWith(col.key);
              const isAsc = order === `${col.key}_asc`;

              return <th key={col.key}>
                <Link href={createSortHref(col.key)}>
                  {col.label}
                  {isSort && (isAsc ? " ↑" : " ↓")}
                </Link>
              </th>;
            })}
          </tr>
        </thead>

        <tbody>
          {tags.map(tag => {
            const draft = getDraft(tag);
            const isRowPending = pendingTagId === tag.id;
            const isBeingEdited = editingTagId === tag.id;
            const isConfirmingDeleted = confirmDeleteTagId === tag.id;

            return (
              <tr key={tag.id}>
                <td>
                  {isBeingEdited ? <input
                    type="text"
                    value={draft.name}
                    onChange={e => updateDraft(tag.id, { name: e.target.value })}
                    onKeyDown={e => handleEditKeyDown(e, tag, isRowPending)}
                    className={styles.textInput}
                    autoFocus
                  /> : <Link href={`/listing?search=${encodeURIComponent(tag.name)}`}>
                    {tag.name}
                  </Link>}
                </td>

                <td>
                  {isBeingEdited ? <input
                    type="text"
                    value={draft.type}
                    onChange={e => updateDraft(tag.id, { type: e.target.value })}
                    onKeyDown={e => handleEditKeyDown(e, tag, isRowPending)}
                    className={styles.textInput}
                  /> : tag.type}
                </td>

                <td>{tag.post_count}</td>

                <td className={styles.actions}>
                  {isBeingEdited ? <>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => saveEdit(tag)}
                      disabled={!isDirty(tag) || isRowPending}
                    >{isRowPending ? "saving..." : "save"}</button>

                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => cancelEdit(tag)}
                      disabled={isRowPending}
                    >cancel</button>
                  </> : <>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => startEdit(tag)}
                      disabled={pendingTagId !== null}
                    >edit</button>

                    {isConfirmingDeleted ? <>
                      <button
                        type="button"
                        className={styles.button}
                        onClick={() => setConfirmDeleteTagId(null)}
                        disabled={isRowPending}
                      >cancel</button>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => deleteTag(tag.id)}
                        disabled={isRowPending}
                      >{isRowPending ? "deleting..." : "confirm"}</button>
                    </> : <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => setConfirmDeleteTagId(tag.id)}
                      disabled={pendingTagId !== null}
                    >delete</button>}
                  </>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
