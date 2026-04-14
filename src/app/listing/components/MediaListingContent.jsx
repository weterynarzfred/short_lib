import Search from "./Search";
import PostItem from "./PostItem";

import styles from "./MediaListing.module.scss";

export default function MediaListingContent({
  contentRef,
  sentinelRef,
  search,
  visiblePosts,
  isMultiSelectEnabled,
  selectedCount,
  selectedPostIds,
  onPostInteract,
  onClearSelection,
  hasMore,
  isLoadingMore,
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
          {selectedCount > 0 ? <>
            <div className={styles.selectionCount}>{selectedCount} selected</div>
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
            isSelected={selectedPostIds.has(post.id)}
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
            {isLoadingMore ? "loading..." : "load more"}
          </button>
        )}

        {visiblePosts.length > 0 && !hasMore ?
          <div className={styles.loadMoreDone}>all matching posts loaded</div> :
          null}
      </div>

      <div ref={sentinelRef} className={styles.loadMoreSentinel} aria-hidden />
    </div>
  );
}
