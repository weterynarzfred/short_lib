"use client";

import { useRef } from "react";
import classNames from "classnames";

import MediaPanel from "./MediaPanel";
import MediaListingContent from "./MediaListingContent";
import useMediaListingPagination from "../lib/useMediaListingPagination";
import useMediaListingPanelNavigation from "../lib/useMediaListingPanelNavigation";

import styles from "./MediaListing.module.scss";

export default function MediaListing({
  posts,
  search,
  mediaSettings,
  initialHasMore = false,
  initialNextOffset = 0,
}) {
  const mediaRef = useRef(null);

  const {
    contentRef,
    sentinelRef,
    visiblePosts,
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

  return (
    <div className={styles.MediaListing}>
      <MediaListingContent
        contentRef={contentRef}
        sentinelRef={sentinelRef}
        search={search}
        visiblePosts={visiblePosts}
        onOpenMedia={open}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
      />

      <div className={classNames(styles.sidebar, { [styles.sidebarActive]: isPanelActive })}>
        {active && (
          <MediaPanel
            post={active}
            close={close}
            prev={prev}
            next={next}
            mediaRef={mediaRef}
            initialSettings={mediaSettings}
          />
        )}
      </div>
    </div>
  );
}
