"use client";

import { useState, useTransition } from "react";

import { clearDeletedStorageAction } from "@/lib/actions";
import formatBytes from "@/lib/formatBytes";

import styles from "./ClearDeletedStoragePanel.module.scss";

export default function ClearDeletedStoragePanel() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState("");

  const clearDeletedStorage = () => {
    const shouldClear = window.confirm(
      "Permanently delete all files in /storage/deleted?"
    );
    if (!shouldClear) return;

    setStatus("");

    startTransition(async () => {
      try {
        const result = await clearDeletedStorageAction();
        const removedFiles = Number(result?.removedFiles) || 0;
        const removedBytes = Number(result?.removedBytes) || 0;

        setStatus(
          `Deleted ${removedFiles} file(s), freed ${formatBytes(removedBytes)}.`
        );
      } catch {
        setStatus("Could not clear /storage/deleted.");
      }
    });
  };

  return (
    <section className={styles.panel}>
      <h2 className={styles.heading}>Storage maintenance</h2>
      <p className={styles.help}>
        Remove permanently deleted files to reclaim disk space.
      </p>

      <button
        type="button"
        className={styles.button}
        onClick={clearDeletedStorage}
        disabled={isPending}
      >
        {isPending ? "clearing..." : "clear /storage/deleted"}
      </button>

      {status && <div className={styles.status}>{status}</div>}
    </section>
  );
}
