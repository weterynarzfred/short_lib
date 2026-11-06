import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import isEditableTarget from "@/lib/isEditableTarget";

function urlWithPost(postId) {
  const url = new URL(window.location.href);
  if (postId == null) url.searchParams.delete("post");
  else url.searchParams.set("post", postId);
  return url;
}

// The open post lives in the URL (`?post=<id>`), so a reload or a copied link reopens it.
// Opening the panel adds one history entry, marked `panelOpen`, and moving between posts
// replaces it, so Back closes the panel instead of leaving the listing or walking back
// through every post viewed. Next.js picks up these native history calls without a
// server round trip.
export default function useMediaListingPanelNavigation({ visiblePosts, hasMore, mediaRef }) {
  const searchParams = useSearchParams();
  const activePostId = Number(searchParams.get("post")) || null;

  const active = visiblePosts.find(post => post.id === activePostId) ?? null;

  // However the panel closes (Escape, the close button, Back), focus returns to the card of
  // the post last shown, so Tab carries on from there instead of restarting at the nav.
  const lastActiveIdRef = useRef(null);
  useEffect(() => {
    if (activePostId != null) {
      lastActiveIdRef.current = activePostId;
      return;
    }
    document.querySelector(`[data-post-id="${lastActiveIdRef.current}"]`)?.focus({ preventScroll: true });
  }, [activePostId]);

  const show = postId => {
    window.history.replaceState(
      { panelOpen: window.history.state?.panelOpen },
      "",
      urlWithPost(postId)
    );
  };

  const close = () => {
    if (activePostId == null) return;

    // A post opened from a link or a reload has no entry of its own to go back past.
    if (window.history.state?.panelOpen) window.history.back();
    else window.history.replaceState(null, "", urlWithPost(null));
  };

  const open = postId => {
    if (activePostId == null) window.history.pushState({ panelOpen: true }, "", urlWithPost(postId));
    else show(postId);
  };

  const prev = () => {
    if (!active || visiblePosts.length < 2) return;

    const index = visiblePosts.indexOf(active);
    show(visiblePosts[index === 0 ? visiblePosts.length - 1 : index - 1].id);
  };

  const next = () => {
    if (!active || visiblePosts.length < 2) return;

    const index = visiblePosts.indexOf(active);
    // Stays on the last loaded post while the next page is still coming, rather than
    // wrapping back to the first.
    const nextIndex = index === visiblePosts.length - 1 ? (hasMore ? index : 0) : index + 1;
    show(visiblePosts[nextIndex].id);
  };

  // The post was deleted, or a link points past the first loaded page.
  useEffect(() => {
    if (activePostId == null) return;
    if (visiblePosts.some(post => post.id === activePostId)) return;

    close();
    mediaRef.current = null;
  }, [visiblePosts, activePostId, mediaRef, close]);

  useEffect(() => {
    if (!active) return;

    const handleKeydown = event => {
      // Up/Down are caret keys inside a field, so a listener on window would move the
      // caret and jump to another post at the same time.
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
    if (active) mediaRef.current?.focus();
  }, [active?.id, mediaRef]);

  return { active, open, close, prev, next };
}
