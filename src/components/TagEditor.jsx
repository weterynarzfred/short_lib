"use client";

import TagSuggestions from "./TagSuggestions";
import useTagSuggestions from "./useTagSuggestions";
import useCombobox from "./useCombobox";

import styles from "./TagEditor.module.scss";

export default function TagEditor({ postId, value, onChange, saveTags, className }) {
  const { items, isLoading } = useTagSuggestions(value, { mode: "edit", key: postId });

  function chooseTag(tag) {
    onChange(prev => {
      const trimmed = prev.trimEnd();
      const parts = trimmed.split(/\s+/);
      parts[parts.length - 1] = tag.name;
      return parts.join(" ") + " ";
    });
  }

  const combobox = useCombobox({ items, onSelect: chooseTag });
  const inputProps = combobox.getInputProps();

  return (
    <div ref={combobox.rootRef} className={styles.TagEditor}>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        className={className}
        {...inputProps}
        onKeyDown={event => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            saveTags();
            return;
          }

          inputProps.onKeyDown(event);
        }}
      />

      <TagSuggestions items={items} isLoading={isLoading} combobox={combobox} />
    </div>
  );
}
