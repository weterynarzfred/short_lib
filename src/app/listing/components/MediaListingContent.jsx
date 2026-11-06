import Search from "./Search";
import PostItem from "./PostItem";

import styles from "./MediaListing.module.scss";

export default function MediaListingContent({
  contentRef,
  sentinelRef,
  search,
  visiblePosts,
  subtitleKinds,
  isMultiSelectEnabled,
  selectedPostIds,
  activePostId,
  onPostInteract,
  onClearSelection,
  hasMore,
  isLoadingMore,
  loadFailed,
  onLoadMore,
}) {
  return (
    <div
      ref={contentRef}
      className={`content content--full ${styles.content}`}
    >
      <h1>media listing</h1>
      <div className={styles.searchTools}>
        <Search initialValue={search} />

        <div className={styles.multiSelectTools}>
          {selectedPostIds.size > 0 ? <>
            <div className={styles.selectionCount}>{selectedPostIds.size} selected</div>
            <button
              type="button"
              className={styles.clearSelection}
              onClick={onClearSelection}
            >clear selection</button>
          </> : null}
        </div>
      </div>
      <div className={styles.list}>
        {visiblePosts.map(post => (
          <PostItem
            key={post.id}
            post={post}
            subtitleKinds={subtitleKinds}
            isSelected={selectedPostIds.has(post.id)}
            isActive={post.id === activePostId}
            isMultiSelectEnabled={isMultiSelectEnabled}
            onInteractPost={onPostInteract}
          />
        ))}
      </div>

      <div className={styles.loadMore}>
        {hasMore && (
          <button
            type="button"
            className={styles.loadMoreButton}
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            {isLoadingMore ? "loading..." : loadFailed ? "couldn't load more, retry" : "load more"}
          </button>
        )}

        {!hasMore && <div className={styles.loadMoreDone}>
          {visiblePosts.length > 0 ? "all matching posts loaded" : "no posts match"}
        </div>}
      </div>

      <div ref={sentinelRef} className={styles.loadMoreSentinel} aria-hidden />
    </div>
  );
}
