"use client";

import { useState, useTransition } from "react";
import classNames from "classnames";

import TagEditor from "@/components/TagEditor";
import { updateBlacklistedTagsAction } from "@/lib/actions";
import SettingActions from "./SettingActions";

import styles from "../page.module.scss";

function normalizeValue(value) {
  return value.split(/\s+/).filter(Boolean).join(" ");
}

export default function BlacklistedTagsSetting({ initialValue }) {
  const normalizedInitial = normalizeValue(initialValue);

  const [value, setValue] = useState(normalizedInitial);
  const [savedValue, setSavedValue] = useState(normalizedInitial);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isDirty = normalizeValue(value) !== savedValue;

  function changeValue(nextValue) {
    setValue(nextValue);
    setStatus("");
    setError("");
  }

  // Also reached through ctrl+enter in the editor, which the disabled button does not guard.
  function saveValue() {
    if (!isDirty || isPending) return;

    setError("");
    setStatus("");

    startTransition(async () => {
      try {
        const result = await updateBlacklistedTagsAction(value);
        const nextValue = normalizeValue(result.tagsValue);

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
        setValue={changeValue}
        saveTags={saveValue}
        inputProps={{
          className: classNames(styles.blacklistInput, {
            [styles.blacklistInputDirty]: isDirty,
          }),
          placeholder: "tags hidden by default in listing",
          "aria-label": "blacklisted tags",
        }}
      />

      <SettingActions
        isDirty={isDirty}
        isPending={isPending}
        onSave={saveValue}
        onReset={() => changeValue(savedValue)}
        status={status}
        error={error}
      />
    </div>
  );
}
