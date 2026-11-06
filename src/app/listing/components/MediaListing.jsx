"use client";

import { useEffect, useRef, useState } from "react";
import classNames from "classnames";

import isEditableTarget from "@/lib/isEditableTarget";
import MediaPanel from "./MediaPanel";
import MediaPanelBulkTagEditor from "./MediaPanelBulkTagEditor";
import MediaListingContent from "./MediaListingContent";
import useMediaListingPagination from "../lib/useMediaListingPagination";
import useMediaListingPanelNavigation from "../lib/useMediaListingPanelNavigation";

import styles from "./MediaListing.module.scss";

export default function MediaListing({
  posts,
  search,
  seed,
  mediaSettings,
  subtitleKinds,
  initialHasMore,
  initialNextOffset,
}) {
  const mediaRef = useRef(null);
  const [panelSettings, setPanelSettings] = useState(mediaSettings);
  const [isMultiSelectEnabled, setIsMultiSelectEnabled] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState(null);

  const {
    contentRef,
    sentinelRef,
    visiblePosts,
    patchVisiblePost,
    removeVisiblePosts,
    hasMore,
    isLoadingMore,
    loadFailed,
    loadMore,
  } = useMediaListingPagination({
    posts,
    search,
    seed,
    initialHasMore,
    initialNextOffset,
  });

  const { active, open, close, prev, next } = useMediaListingPanelNavigation({
    visiblePosts,
    // After a failed load nothing is coming, so wrap rather than sit on the last post.
    hasMore: hasMore && !loadFailed,
    mediaRef,
  });

  const visiblePostIds = visiblePosts.map(post => post.id);
  const selectedPostIdsSet = new Set(selectedPostIds);
  const activePostId = active?.id ?? null;

  const clearSelection = () => {
    setSelectedPostIds([]);
    setSelectionAnchorId(null);
  };

  const getRangeSelectionIds = (fromId, toId) => {
    const fromIndex = visiblePostIds.indexOf(fromId);
    const toIndex = visiblePostIds.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) return [toId];

    return visiblePostIds.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1);
  };

  const interactWithPost = (postId, event) => {
    const hasToggleModifier = event.ctrlKey || event.metaKey;
    const hasRangeModifier = event.shiftKey;

    if (!isMultiSelectEnabled && !hasToggleModifier && !hasRangeModifier) {
      open(postId);
      return;
    }

    close();
    setIsMultiSelectEnabled(true);

    // A modifier click while a post is open starts the selection from that post.
    if (!isMultiSelectEnabled && activePostId != null) {
      setSelectedPostIds(hasRangeModifier
        ? getRangeSelectionIds(activePostId, postId)
        : [...new Set([activePostId, postId])]);
      setSelectionAnchorId(activePostId);
      return;
    }

    setSelectedPostIds(previous => {
      const selection = new Set(previous);

      if (hasRangeModifier) {
        const rangeIds = getRangeSelectionIds(selectionAnchorId ?? postId, postId);

        if (!hasToggleModifier) selection.clear();
        for (const id of rangeIds) selection.add(id);
      } else {
        if (selection.has(postId)) selection.delete(postId);
        else selection.add(postId);
      }

      return [...selection];
    });

    setSelectionAnchorId(postId);
  };

  useEffect(() => {
    const visiblePostIdSet = new Set(visiblePostIds);

    setSelectedPostIds(previous =>
      previous.filter(postId => visiblePostIdSet.has(postId))
    );
    setSelectionAnchorId(previous =>
      previous != null && visiblePostIdSet.has(previous) ? previous : null
    );
  }, [visiblePostIds]);

  useEffect(() => {
    if (isMultiSelectEnabled && selectedPostIds.length === 0) {
      setIsMultiSelectEnabled(false);
      clearSelection();
    }
  }, [isMultiSelectEnabled, selectedPostIds, clearSelection]);

  // Escape leaves selection mode the way it closes the post panel. Below tablet width the
  // bulk panel covers the listing's "clear selection", so this and the panel's own "done"
  // are the only ways out there.
  useEffect(() => {
    if (!isMultiSelectEnabled) return;

    const handleKeydown = event => {
      if (event.key === "Escape" && !isEditableTarget(event.target)) clearSelection();
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [isMultiSelectEnabled, clearSelection]);

  useEffect(() => {
    setPanelSettings(mediaSettings);
  }, [mediaSettings]);

  // Keeps the grid in step with the panel while arrowing through posts. `nearest` scrolls
  // only when the card is off-screen, so stepping along a visible row does not shunt the
  // listing around. Pointless in fullscreen, where the listing is covered anyway.
  useEffect(() => {
    if (activePostId == null || panelSettings.fullscreen) return;

    contentRef.current
      .querySelector(`[data-post-id="${activePostId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activePostId, panelSettings.fullscreen, contentRef]);

  // Panel navigation never reaches the grid's sentinel in fullscreen, so fetch ahead here.
  // loadMore changes identity when a load ends, so without the loadFailed guard a failure
  // would retry in a loop.
  useEffect(() => {
    if (activePostId == null || !hasMore || loadFailed) return;
    if (visiblePostIds.indexOf(activePostId) >= visiblePostIds.length - 10) loadMore();
  }, [activePostId, visiblePostIds, hasMore, loadFailed, loadMore]);

  return (
    <div className={styles.mediaListing}>
      <MediaListingContent
        contentRef={contentRef}
        sentinelRef={sentinelRef}
        search={search}
        visiblePosts={visiblePosts}
        subtitleKinds={subtitleKinds}
        isMultiSelectEnabled={isMultiSelectEnabled}
        selectedPostIds={selectedPostIdsSet}
        activePostId={activePostId}
        onPostInteract={interactWithPost}
        onClearSelection={clearSelection}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        onLoadMore={loadMore}
      />

      <div className={classNames(styles.sidebar, { [styles.sidebarActive]: active || isMultiSelectEnabled })}>
        {isMultiSelectEnabled ? (
          <MediaPanelBulkTagEditor
            postIds={selectedPostIds}
            posts={visiblePosts.filter(post => selectedPostIdsSet.has(post.id))}
            onClose={clearSelection}
            onPatchPost={patchVisiblePost}
            onRemovePosts={removeVisiblePosts}
          />
        ) : active && (
          <MediaPanel
            post={active}
            close={close}
            prev={prev}
            next={next}
            mediaRef={mediaRef}
            initialSettings={panelSettings}
            onPatchPost={patchVisiblePost}
            onRemovePosts={removeVisiblePosts}
            onSettingsChange={setPanelSettings}
          />
        )}
      </div>
    </div>
  );
}
