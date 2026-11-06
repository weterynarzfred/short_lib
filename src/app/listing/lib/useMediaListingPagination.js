import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Edits patch the posts in place instead of revalidating, so Next's cached copy of the
// first page keeps the old data and Back would show it. Lives at module level to survive
// the unmount; a full reload resets it along with the cache.
let isCachedPageStale = false;

export default function useMediaListingPagination({
  posts,
  search,
  seed,
  initialHasMore,
  initialNextOffset,
}) {
  const contentRef = useRef(null);
  const sentinelRef = useRef(null);
  const latestSearchRef = useRef(search);

  const [visiblePosts, setVisiblePosts] = useState(posts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (!isCachedPageStale) return;
    isCachedPageStale = false;
    router.refresh();
  }, [router]);

  useEffect(() => {
    latestSearchRef.current = search;
  }, [search]);

  useEffect(() => {
    setVisiblePosts(posts);
    setHasMore(initialHasMore);
    setNextOffset(initialNextOffset);
    setLoadFailed(false);
  }, [posts, initialHasMore, initialNextOffset]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    const requestSearch = search;
    setIsLoadingMore(true);
    setLoadFailed(false);
    try {
      const params = new URLSearchParams();
      if (requestSearch) params.set("search", requestSearch);
      params.set("offset", String(nextOffset));
      params.set("seed", String(seed));

      const response = await fetch(`/api/listing?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed to load more posts (${response.status})`);

      const payload = await response.json();
      if (latestSearchRef.current !== requestSearch) return;

      setVisiblePosts(prevPosts => {
        const seen = new Set(prevPosts.map(post => post.id));
        return [...prevPosts, ...payload.posts.filter(post => !seen.has(post.id))];
      });
      setHasMore(payload.hasMore);
      setNextOffset(payload.nextOffset);
    } catch (error) {
      console.error(error);
      // Stops the observer from retrying in a loop; the button retries by hand.
      setLoadFailed(true);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, nextOffset, search, seed]);

  const patchVisiblePost = useCallback((postId, patch) => {
    isCachedPageStale = true;
    setVisiblePosts(previous => previous.map(post =>
      post.id === postId ? { ...post, ...patch } : post
    ));
  }, []);

  // Deletes are applied here rather than revalidated, which would reset the listing to its
  // first page. The server's offsets shift down by however many were removed.
  const removeVisiblePosts = ids => {
    const idSet = new Set(ids);
    const removed = visiblePosts.filter(post => idSet.has(post.id)).length;
    isCachedPageStale = true;
    setVisiblePosts(previous => previous.filter(post => !idSet.has(post.id)));
    setNextOffset(previous => previous - removed);
  };

  useEffect(() => {
    if (!hasMore || isLoadingMore || loadFailed) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) loadMore();
      },
      {
        root: contentRef.current,
        rootMargin: "300px 0px",
      }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadFailed, loadMore]);

  return {
    contentRef,
    sentinelRef,
    visiblePosts,
    patchVisiblePost,
    removeVisiblePosts,
    hasMore,
    isLoadingMore,
    loadFailed,
    loadMore,
  };
}
