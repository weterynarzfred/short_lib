"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";

import MediaPanel from "./MediaPanel";
import MediaPanelBulkTagEditor from "./MediaPanelBulkTagEditor";
import MediaListingContent from "./MediaListingContent";
import useMediaListingPagination from "../lib/useMediaListingPagination";
import useMediaListingPanelNavigation from "../lib/useMediaListingPanelNavigation";

import styles from "./MediaListing.module.scss";

export default function MediaListing({
  posts,
  search,
  mediaSettings,
  subtitleKinds = [],
  initialHasMore = false,
  initialNextOffset = 0,
}) {
  const mediaRef = useRef(null);
  const [panelSettings, setPanelSettings] = useState(() => ({
    ...mediaSettings,
  }));
  const [isMultiSelectEnabled, setIsMultiSelectEnabled] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState(null);

  const {
    contentRef,
    sentinelRef,
    visiblePosts,
    patchVisiblePost,
    hasMore,
    isLoadingMore,
    loadMore,
  } = useMediaListingPagination({
    posts,
    search,
    initialHasMore,
    initialNextOffset,
  });

  const {
    active,
    open,
    close,
    prev,
    next,
    isPanelActive,
  } = useMediaListingPanelNavigation({
    visiblePosts,
    mediaRef,
  });

  const visiblePostIds = useMemo(
    () => visiblePosts.map(post => post.id),
    [visiblePosts]
  );
  const selectedPostIdsSet = useMemo(
    () => new Set(selectedPostIds),
    [selectedPostIds]
  );
  const selectedCount = selectedPostIds.length;
  const activePostId = active?.id ?? null;

  const clearSelection = useCallback(() => {
    setSelectedPostIds([]);
    setSelectionAnchorId(null);
  }, []);

  const setMultiSelect = useCallback(enabled => {
    setIsMultiSelectEnabled(enabled);
    if (enabled) {
      close();
      return;
    }

    clearSelection();
  }, [clearSelection, close]);

  const getRangeSelectionIds = useCallback((fromId, toId) => {
    const fromIndex = visiblePostIds.indexOf(fromId);
    const toIndex = visiblePostIds.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) return [toId];

    const [start, end] = fromIndex < toIndex
      ? [fromIndex, toIndex]
      : [toIndex, fromIndex];

    return visiblePostIds.slice(start, end + 1);
  }, [visiblePostIds]);

  const interactWithPost = useCallback((postId, event) => {
    const hasToggleModifier = Boolean(event?.ctrlKey || event?.metaKey);
    const hasRangeModifier = Boolean(event?.shiftKey);
    const hasModifier = hasToggleModifier || hasRangeModifier;
    const shouldSeedFromActive = !isMultiSelectEnabled && hasModifier && activePostId != null;
    const shouldUseMultiSelect = isMultiSelectEnabled || hasModifier;

    if (!shouldUseMultiSelect) {
      open(postId);
      return;
    }

    if (shouldSeedFromActive) {
      close();
      setIsMultiSelectEnabled(true);

      if (hasRangeModifier) {
        setSelectedPostIds(getRangeSelectionIds(activePostId, postId));
      } else if (hasToggleModifier) {
        setSelectedPostIds([...new Set([activePostId, postId])]);
      }

      setSelectionAnchorId(activePostId);
      return;
    }

    close();
    if (hasModifier && !isMultiSelectEnabled) setIsMultiSelectEnabled(true);

    setSelectedPostIds(previous => {
      const next = new Set(previous);

      if (hasRangeModifier) {
        const anchor = selectionAnchorId ?? postId;
        const rangeIds = getRangeSelectionIds(anchor, postId);

        if (!hasToggleModifier) next.clear();
        for (const id of rangeIds) next.add(id);
      } else {
        if (next.has(postId)) next.delete(postId);
        else next.add(postId);
      }

      return [...next];
    });

    setSelectionAnchorId(postId);
  }, [
    activePostId,
    close,
    getRangeSelectionIds,
    isMultiSelectEnabled,
    open,
    selectionAnchorId,
  ]);

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
      setMultiSelect(false);
    }
  }, [isMultiSelectEnabled, selectedPostIds, setMultiSelect]);

  useEffect(() => {
    setPanelSettings({ ...mediaSettings });
  }, [mediaSettings]);

  // Keeps the grid in step with the panel while arrowing through posts. `nearest` scrolls
  // only when the card is off-screen, so stepping along a visible row does not shunt the
  // listing around. Pointless in fullscreen, where the listing is covered anyway.
  useEffect(() => {
    if (activePostId == null || panelSettings.fullscreen) return;

    contentRef.current
      ?.querySelector(`[data-post-id="${activePostId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activePostId, panelSettings.fullscreen, contentRef]);

  return (
    <div className={styles.mediaListing}>
      <MediaListingContent
        contentRef={contentRef}
        sentinelRef={sentinelRef}
        search={search}
        visiblePosts={visiblePosts}
        subtitleKinds={subtitleKinds}
        isMultiSelectEnabled={isMultiSelectEnabled}
        selectedCount={selectedCount}
        selectedPostIds={selectedPostIdsSet}
        onPostInteract={interactWithPost}
        onClearSelection={clearSelection}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />

      <div className={classNames(styles.sidebar, { [styles.sidebarActive]: isPanelActive || isMultiSelectEnabled })}>
        {isMultiSelectEnabled ? (
          <MediaPanelBulkTagEditor
            postIds={selectedPostIds}
            onDeleteAll={clearSelection}
            onPatchPost={patchVisiblePost}
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
            onSettingsChange={setPanelSettings}
          />
        )}
      </div>
    </div>
  );
}
