import { useCallback, useEffect, useMemo, useState } from "react";

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
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") prev();
      if (event.key === "ArrowRight") next();
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
