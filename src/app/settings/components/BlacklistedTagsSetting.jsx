"use client";

import { useMemo, useState, useTransition } from "react";
import classNames from "classnames";

import TagEditor from "@/components/TagEditor";
import { updateBlacklistedTagsAction } from "@/lib/actions";

import styles from "../page.module.scss";

function normalizeValue(value) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export default function BlacklistedTagsSetting({ initialValue = "" }) {
  const normalizedInitial = useMemo(
    () => normalizeValue(initialValue),
    [initialValue]
  );

  const [value, setValue] = useState(normalizedInitial);
  const [savedValue, setSavedValue] = useState(normalizedInitial);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isDirty = normalizeValue(value) !== savedValue;

  function saveValue() {
    if (!isDirty || isPending) return;

    setError("");
    setStatus("");

    startTransition(async () => {
      try {
        const result = await updateBlacklistedTagsAction(value);
        const nextValue = normalizeValue(result?.tagsValue);

        setValue(nextValue);
        setSavedValue(nextValue);
        setStatus("saved");
      } catch {
        setError("failed to save setting");
      }
    });
  }

  return (
    <div className={styles.blacklistEditor}>
      <TagEditor
        postId="listing-blacklisted-tags"
        value={value}
        setValue={nextValue => {
          setValue(nextValue);
          setStatus("");
          setError("");
        }}
        saveTags={saveValue}
        inputProps={{
          className: classNames(styles.blacklistInput, {
            [styles.blacklistInputDirty]: isDirty,
          }),
          placeholder: "tags hidden by default in listing",
          "aria-label": "blacklisted tags",
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
