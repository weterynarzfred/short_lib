import { useCallback, useEffect, useMemo, useState } from "react";

const SUPPORTED_MEDIA_TYPES = new Set(["image", "video", "audio"]);

export default function useMediaListingPanelNavigation({ visiblePosts, mediaRef }) {
  const [activePostId, setActivePostId] = useState(null);

  const supportedPosts = useMemo(
    () => visiblePosts.filter(post => {
      const mediaType = post?.mime_type?.split("/")?.[0];
      return SUPPORTED_MEDIA_TYPES.has(mediaType);
    }),
    [visiblePosts]
  );

  const active = useMemo(
    () => supportedPosts.find(post => post.id === activePostId) ?? null,
    [supportedPosts, activePostId]
  );

  const close = useCallback(() => setActivePostId(null), []);
  const open = useCallback(postId => setActivePostId(postId), []);

  const prev = useCallback(() => {
    setActivePostId(currentId => {
      if (currentId == null || supportedPosts.length < 2) return currentId;

      const index = supportedPosts.findIndex(post => post.id === currentId);
      if (index === -1) return null;

      const nextIndex = index === 0 ? supportedPosts.length - 1 : index - 1;
      return supportedPosts[nextIndex]?.id ?? null;
    });
  }, [supportedPosts]);

  const next = useCallback(() => {
    setActivePostId(currentId => {
      if (currentId == null || supportedPosts.length < 2) return currentId;

      const index = supportedPosts.findIndex(post => post.id === currentId);
      if (index === -1) return null;

      const nextIndex = index === supportedPosts.length - 1 ? 0 : index + 1;
      return supportedPosts[nextIndex]?.id ?? null;
    });
  }, [supportedPosts]);

  useEffect(() => {
    if (activePostId == null) return;
    if (supportedPosts.some(post => post.id === activePostId)) return;

    setActivePostId(null);
    mediaRef.current = null;
  }, [supportedPosts, activePostId, mediaRef]);

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
