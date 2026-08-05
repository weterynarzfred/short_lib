import { useCallback, useEffect, useMemo, useState } from "react";

import isEditableTarget from "@/lib/isEditableTarget";

export default function useMediaListingPanelNavigation({ visiblePosts, mediaRef }) {
  const [activePostId, setActivePostId] = useState(null);

  const active = useMemo(
    () => visiblePosts.find(post => post.id === activePostId) ?? null,
    [visiblePosts, activePostId]
  );

  const close = useCallback(() => setActivePostId(null), []);
  const open = useCallback(postId => setActivePostId(postId), []);

  const prev = useCallback(() => {
    setActivePostId(currentId => {
      if (currentId == null || visiblePosts.length < 2) return currentId;

      const index = visiblePosts.findIndex(post => post.id === currentId);
      if (index === -1) return null;

      const nextIndex = index === 0 ? visiblePosts.length - 1 : index - 1;
      return visiblePosts[nextIndex]?.id ?? null;
    });
  }, [visiblePosts]);

  const next = useCallback(() => {
    setActivePostId(currentId => {
      if (currentId == null || visiblePosts.length < 2) return currentId;

      const index = visiblePosts.findIndex(post => post.id === currentId);
      if (index === -1) return null;

      const nextIndex = index === visiblePosts.length - 1 ? 0 : index + 1;
      return visiblePosts[nextIndex]?.id ?? null;
    });
  }, [visiblePosts]);

  useEffect(() => {
    if (activePostId == null) return;
    if (visiblePosts.some(post => post.id === activePostId)) return;

    setActivePostId(null);
    mediaRef.current = null;
  }, [visiblePosts, activePostId, mediaRef]);

  useEffect(() => {
    if (!active) return;

    const handleKeydown = event => {
      // Up/Down are caret keys inside a field, so a listener on window would move the
      // caret and jump to another post at the same time. Guarding centrally covers every
      // field rather than relying on each editor to stop propagation for the exact keys
      // navigation happens to use today.
      if (isEditableTarget(event.target)) return;

      if (event.key === "Escape") {
        close();
        return;
      }

      // Left/Right are deliberately not bound: they belong to the focused video, which the
      // panel focuses on open, so they seek natively.
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        // Otherwise the listing scrolls behind the panel, and a focused video would also
        // take these as volume controls.
        event.preventDefault();
        if (event.key === "ArrowUp") prev();
        else next();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [active, close, prev, next]);

  useEffect(() => {
    if (active && mediaRef.current) mediaRef.current.focus();
  }, [active?.id, mediaRef]);

  return {
    active,
    open,
    close,
    prev,
    next,
    isPanelActive: Boolean(active),
  };
}
