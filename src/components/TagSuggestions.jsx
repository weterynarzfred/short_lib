import useTagSuggestions from "./useTagSuggestions";

import styles from "./TagSuggestions.module.scss";

export default function TagSuggestions({
  value,
  items,
  setItems,
  activeIndex,
  setActiveIndex,
  isOpen,
  setIsOpen,
  rootRef,
  suppressSuggestRef,
  listId,
}) {


  const isLoading = useTagSuggestions({
    value,
    items,
    activeIndex,
    isOpen,
    setIsOpen,
    setItems,
    setActiveIndex,
    rootRef,
    suppressSuggestRef,
    listId
  });

  if (!isOpen) return null;

  return <>
    <div className={styles.TagSuggestions} role="listbox" id={listId}>
      {isLoading ? <div className={styles.SuggestionMeta}>Loading…</div> : null}

      {items.map((t, idx) => (
        <div
          key={t.id}
          id={`${listId}-opt-${t.id}`}
          role="option"
          aria-selected={idx === activeIndex}
          className={`${styles.Suggestion} ${idx === activeIndex ? styles.Active : ""}`}
          onMouseDown={e => e.preventDefault()}
          onMouseEnter={() => setActiveIndex(idx)}
          onClick={() => chooseTag(t)}
        >
          <span className={styles.TagName}>{t.name}</span>
          <span className={styles.TagMeta}>{t.type}{" · "}{t.postCount}</span>
        </div>
      ))}
    </div>
  </>;
}
