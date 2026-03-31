"use client";

import classNames from "classnames";
import { getTagTypeClassName } from "@/lib/tagTypeOrder";

import styles from "./TagSuggestions.module.scss";

export default function TagSuggestions({
  items,
  isLoading,
  combobox,
}) {
  if (!combobox.isOpen) return null;

  return (
    <div role="listbox" id={combobox.listId} className={styles.tagSuggestions}>
      {isLoading && <div className={styles.suggestionMeta}>Loading...</div>}

      {items.map((tag, idx) => (
        <div
          key={tag.id}
          className={classNames(styles.suggestion, getTagTypeClassName(tag.type), {
            [styles.active]: idx === combobox.activeIndex,
          })}
          {...combobox.getItemProps({ index: idx, id: tag.id })}
        >
          <span className={styles.tagName}>{tag.name}</span>
          <span className={styles.tagMeta}>
            {tag.type}{" | "}{tag.postCount}
          </span>
        </div>
      ))}
    </div>
  );
}
