"use client";

import classNames from "classnames";
import { getTagTypeClassName } from "@/lib/tagTypeOrder";
import { useTagTooltip } from "./TagTooltip";

import styles from "./TagSuggestions.module.scss";

export default function TagSuggestions({
  items,
  isLoading,
  combobox,
}) {
  const { showTagTooltip, hideTagTooltip, cancelTagTooltip } = useTagTooltip();

  if (!combobox.isOpen) return null;

  return (
    <div role="listbox" id={combobox.listId} className={styles.tagSuggestions}>
      {isLoading && <div className={styles.suggestionMeta}>Loading...</div>}

      {items.map((tag, idx) => {
        const itemProps = combobox.getItemProps({ index: idx, id: tag.id });
        // Operators and their values carry a string id and are not tags to look up.
        const tooltipName = typeof tag.id === "number"
          ? (tag.insertName ?? tag.name)
          : null;

        return <div
          key={tag.id}
          className={classNames(styles.suggestion, getTagTypeClassName(tag.type), {
            [styles.active]: idx === combobox.activeIndex,
          })}
          {...itemProps}
          onMouseEnter={event => {
            // Must not replace the combobox handler, which tracks the active item.
            itemProps.onMouseEnter?.(event);
            if (tooltipName)
              showTagTooltip(tooltipName, event.currentTarget.getBoundingClientRect());
          }}
          onMouseLeave={() => cancelTagTooltip()}
          onClick={event => {
            // Accepting a suggestion closes the dropdown, so the card would be left
            // pointing at an element that no longer exists.
            hideTagTooltip();
            itemProps.onClick?.(event);
          }}
        >
          <span className={styles.tagName}>{tag.name}</span>
          <span className={styles.tagMeta}>
            {tag.type}{" | "}{tag.postCount}
          </span>
        </div>;
      })}
    </div>
  );
}
