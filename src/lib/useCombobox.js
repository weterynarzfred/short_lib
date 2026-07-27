import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import chooseComboboxTag from "../lib/chooseComboboxTag";

export default function useCombobox({
  items,
  setValue,
  cursor,
  moveCursorTo,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const rootRef = useRef(null);
  const listId = useMemo(() => `cb-${Math.random().toString(36).slice(2)}`, []);
  const hasUserTypedRef = useRef(false);

  const onFocus = useCallback(() => {
    if (items.length > 0) setIsOpen(true);
  }, [items.length]);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
    hasUserTypedRef.current = false;
  }, []);

  useEffect(() => {
    if (items.length > 0) {
      if (hasUserTypedRef.current) {
        setIsOpen(true);
        setActiveIndex(0);
      }
    } else {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }, [items]);

  useEffect(() => {
    function handleDocumentClick(e) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) close();
    }
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [close]);

  const onKeyDown = useCallback(event => {
    if (["ArrowLeft", "ArrowRight"].includes(event.key))
      event.stopPropagation();

    if (!isOpen) {
      if (event.key === "ArrowDown" && items.length) {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(i => Math.min(i + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (["Enter", "Tab"].includes(event.key)) {
      if (activeIndex >= 0 && activeIndex < items.length) {
        event.preventDefault();
        event.stopPropagation();
        // chooseTag decides whether to close: operators with values stay open.
        chooseTag(items[activeIndex]);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }, [isOpen, items, activeIndex, chooseTag, close]);

  function chooseTag(tag) {
    setValue(prev => {
      const { next, nextCursor } = chooseComboboxTag({ prev, cursor, tag });
      moveCursorTo(nextCursor);
      return next;
    });

    // Accepting an operator that has its own value list should show that list right away,
    // rather than making the user reopen the dropdown to find out what is allowed. Staying
    // open is only safe for operators that actually have values - the rest fall through to
    // a tag search on a query like "file_size:", which is noise.
    if (tag?.hasValues) {
      // The effect watching `items` opens the list once the values arrive; this is the
      // flag it checks. The stale operator list stays until then, so nothing is
      // highlighted in the meantime.
      hasUserTypedRef.current = true;
      setActiveIndex(-1);
      return;
    }

    close();
  }

  function getInputProps() {
    const active = isOpen && activeIndex >= 0 ? items[activeIndex] : null;
    return {
      onKeyDown,
      onFocus,
      onInput: () => { hasUserTypedRef.current = true; },
      role: "combobox",
      "aria-autocomplete": "list",
      "aria-expanded": isOpen,
      "aria-controls": isOpen ? listId : undefined,
      "aria-activedescendant": active ? `${listId}-opt-${active.id}` : undefined,
    };
  }

  function getItemProps({ index, id }) {
    return {
      id: `${listId}-opt-${id}`,
      role: "option",
      "aria-selected": index === activeIndex,
      onMouseDown: e => e.preventDefault(),
      onMouseEnter: () => setActiveIndex(index),
      onClick: () => chooseTag(items[index]),
    };
  }

  useEffect(() => {
    if (!items.length) close();
    else if (activeIndex >= items.length) setActiveIndex(items.length - 1);
  }, [items, activeIndex, close]);

  return {
    rootRef,
    listId,
    isOpen,
    activeIndex,
    close,
    getInputProps,
    getItemProps,
  };
}
