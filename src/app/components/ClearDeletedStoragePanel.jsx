"use client";

import { useState, useTransition } from "react";

import { clearDeletedStorageAction } from "@/lib/actions";
import formatBytes from "@/lib/formatBytes";

import styles from "./ClearDeletedStoragePanel.module.scss";

export default function ClearDeletedStoragePanel() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState("");

  const clearDeletedStorage = () => {
    if (!window.confirm("Permanently delete all files in /storage/deleted?")) return;

    setStatus("");

    startTransition(async () => {
      try {
        const { removedFiles, removedBytes } = await clearDeletedStorageAction();
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
