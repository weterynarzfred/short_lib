"use client";

import TagSuggestions from "./TagSuggestions";
import useTagSuggestions from "./useTagSuggestions";
import useCombobox from "./useCombobox";

import styles from "./TagEditor.module.scss";

export default function TagEditor({ value, onChange, className }) {
  const { items, isLoading } = useTagSuggestions(value, { mode: "edit" });

  function chooseTag(tag) {
    onChange(prev => {
      const trimmed = prev.trimEnd();
      const parts = trimmed.split(/\s+/);
      parts[parts.length - 1] = tag.name;
      return parts.join(" ") + " ";
    });
  }

  const combobox = useCombobox({ items, onSelect: chooseTag });

  return (
    <div ref={combobox.rootRef} className={styles.TagEditor}>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        className={className}
        {...combobox.getInputProps()}
      />

      <TagSuggestions items={items} isLoading={isLoading} combobox={combobox} />
    </div>
  );
}
