import Search from "./Search";
import PostItem from "./PostItem";

import styles from "./MediaListing.module.scss";

export default function MediaListingContent({
  contentRef,
  sentinelRef,
  search,
  visiblePosts,
  onOpenMedia,
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
      <Search initialValue={search} />
      <div className={styles.list}>
        {visiblePosts.map(post => (
          <PostItem key={post.id} post={post} openMediaPanel={onOpenMedia} />
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
