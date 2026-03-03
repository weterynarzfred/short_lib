"use client";

import classNames from "classnames";

import styles from "./TagSuggestions.module.scss";

export default function TagSuggestions({
  items,
  isLoading,
  combobox,
}) {
  if (!combobox.isOpen) return null;

  return (
    <div role="listbox" id={combobox.listId} className={styles.TagSuggestions}>
      {isLoading && <div className={styles.SuggestionMeta}>Loading…</div>}

      {items.map((t, idx) => (
        <div
          key={t.id}
          className={classNames(styles.Suggestion, { [styles.Active]: idx === combobox.activeIndex })}
          {...combobox.getItemProps({ index: idx, id: t.id })}
        >
          <span className={styles.TagName}>{t.name}</span>
          <span className={styles.TagMeta}>{t.type}{" · "}{t.postCount}</span>
        </div>
      ))}
    </div>
  );
}
