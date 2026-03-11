import Link from "next/link";

import styles from "./TagTable.module.scss";

export default function TagTableRow({ tag, editor }) {
  const {
    editingTagId,
    confirmDeleteTagId,
    pendingTagId,
    setConfirmDeleteTagId,
    updateDraft,
    getDraft,
    isDirty,
    startEdit,
    cancelEdit,
    saveEdit,
    deleteTag,
    handleEditKeyDown,
  } = editor;

  const draft = getDraft(tag);
  const isRowPending = pendingTagId === tag.id;
  const isBeingEdited = editingTagId === tag.id;
  const isConfirmingDelete = confirmDeleteTagId === tag.id;
  const isAnyPending = pendingTagId !== null;
  const isSaveDisabled = !isDirty(tag) || isRowPending;

  return <tr>
    <td>
      {isBeingEdited ? <input
        type="text"
        value={draft.name}
        onChange={event => updateDraft(tag.id, { name: event.target.value })}
        onKeyDown={event => handleEditKeyDown(event, tag, isRowPending)}
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
        onChange={event => updateDraft(tag.id, { type: event.target.value })}
        onKeyDown={event => handleEditKeyDown(event, tag, isRowPending)}
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
          disabled={isSaveDisabled}
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
          disabled={isAnyPending}
        >edit</button>

        {isConfirmingDelete ? <>
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
        </> :
          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => setConfirmDeleteTagId(tag.id)}
            disabled={isAnyPending}
          >delete</button>}
      </>}
    </td>
  </tr>;
}
