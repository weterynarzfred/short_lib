import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

  const onFocus = useCallback(() => {
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
        chooseTag(items[activeIndex]);
        close();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }, [isOpen, items, activeIndex, chooseTag, close]);

  // TODO: move to a separate file and add tests
  function chooseTag(tag) {
    const isOperator = tag.type === "operator";

    setValue(prev => {
      const pos = typeof cursor === "number" ? cursor : prev.length;

      const start = prev.slice(0, pos).lastIndexOf(" ") + 1;
      const nextSpace = prev.indexOf(" ", pos);
      const end = nextSpace === -1 ? prev.length : nextSpace;

      const token = prev.slice(start, end);
      const isNegative = token.startsWith("-");
      const sign = isNegative ? "-" : "";

      const contentStart = start + sign.length;
      const left = prev.slice(contentStart, pos);
      const right = prev.slice(pos, end);

      let consumedRight = 0;

      if (tag.name.startsWith(left)) {
        for (let i = right.length; i >= 0; i--) {
          if (tag.name.startsWith(left + right.slice(0, i))) {
            consumedRight = i;
            break;
          }
        }
      }

      const remainingRight = right.slice(consumedRight);
      const hasSpaceAfterToken = prev[end] === " ";

      const separator = remainingRight
        ? (isOperator ? "" : " ")
        : (isOperator || hasSpaceAfterToken ? "" : " ");

      const next =
        prev.slice(0, start) +
        sign +
        tag.name +
        separator +
        remainingRight +
        prev.slice(end);

      const nextCursor =
        start +
        sign.length +
        tag.name.length +
        separator.length +
        (!remainingRight && hasSpaceAfterToken && !isOperator ? 1 : 0);

      moveCursorTo(nextCursor);
      return next;
    });
  }

  function getInputProps() {
    const active = isOpen && activeIndex >= 0 ? items[activeIndex] : null;
    return {
      onKeyDown,
      onFocus,
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
      onClick: () => { chooseTag(items[index]); close(); },
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
    getInputProps,
    getItemProps,
  };
}
