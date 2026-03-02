import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function useCombobox({ items, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const listId = useMemo(() => `cb-${Math.random().toString(36).slice(2)}`, []);

  const openIfHasItems = useCallback(() => {
    if (items.length > 0) setIsOpen(true);
  }, [items.length]);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    if (items.length > 0) {
      setIsOpen(true);
      setActiveIndex(0);
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
    if (!isOpen) {
      if (event.key === "ArrowDown" && items.length) {
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(i => Math.min(i + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < items.length) {
        event.preventDefault();
        onSelect(items[activeIndex]);
        close();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }, [isOpen, items, activeIndex, onSelect, close]);

  function getInputProps() {
    const active = isOpen && activeIndex >= 0 ? items[activeIndex] : null;
    return {
      onKeyDown,
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
      onClick: () => { onSelect(items[index]); close(); },
    };
  }

  useEffect(() => {
    if (!items.length) close();
    else if (activeIndex >= items.length) setActiveIndex(items.length - 1);
  }, [items, activeIndex, close]);

  return {
    rootRef,
    listId,
    items,
    isOpen,
    activeIndex,
    setIsOpen,
    setActiveIndex,
    openIfHasItems,
    close,
    getInputProps,
    getItemProps,
  };
}
