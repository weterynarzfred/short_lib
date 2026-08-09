"use client";

import { useState, useTransition } from "react";

import { updateDescribePromptAction } from "@/lib/actions";

import styles from "../page.module.scss";

export default function DescribePromptSetting({ initialValue = "" }) {
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isDirty = value !== savedValue;

  function saveValue() {
    if (!isDirty || isPending) return;

    setError("");
    setStatus("");

    startTransition(async () => {
      try {
        // Saving a blank prompt stores nothing, and the default comes back - which is how
        // the field resets itself.
        const result = await updateDescribePromptAction(value);

        setValue(result.prompt);
        setSavedValue(result.prompt);
        setStatus("saved");
      } catch {
        setError("failed to save setting");
      }
    });
  }

  return (
    <div className={styles.describePromptEditor}>
      <textarea
        className={styles.describePromptInput}
        value={value}
        rows={10}
        spellCheck={false}
        aria-label="describe prompt"
        onChange={event => {
          setValue(event.target.value);
          setStatus("");
          setError("");
        }}
      />

      <div className={styles.settingActions}>
        <button
          type="button"
          className={styles.settingButton}
          disabled={!isDirty || isPending}
          onClick={saveValue}
        >{isPending ? "saving..." : "save"}</button>

        <button
          type="button"
          className={styles.settingButton}
          disabled={!isDirty || isPending}
          onClick={() => {
            setValue(savedValue);
            setStatus("");
            setError("");
          }}
        >reset</button>

        {status ? <div className={styles.statusOk}>{status}</div> : null}
        {error ? <div className={styles.statusError}>{error}</div> : null}
      </div>
    </div>
  );
}
