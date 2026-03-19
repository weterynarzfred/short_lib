import { useCallback, useEffect, useRef, useState } from "react";

export default function useMediaListingPagination({
  posts,
  search,
  initialHasMore = false,
  initialNextOffset = 0,
}) {
  const contentRef = useRef(null);
  const sentinelRef = useRef(null);
  const latestSearchRef = useRef(search);

  const [visiblePosts, setVisiblePosts] = useState(posts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    latestSearchRef.current = search;
  }, [search]);

  useEffect(() => {
    setVisiblePosts(posts);
    setHasMore(initialHasMore);
    setNextOffset(initialNextOffset);
  }, [posts, initialHasMore, initialNextOffset]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    const requestSearch = search;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (requestSearch) params.set("search", requestSearch);
      params.set("offset", String(nextOffset));

      const response = await fetch(`/api/listing?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Failed to load more posts (${response.status})`);

      const payload = await response.json();
      const incoming = Array.isArray(payload.posts) ? payload.posts : [];
      if (latestSearchRef.current !== requestSearch) return;

      setVisiblePosts(prevPosts => {
        const seen = new Set(prevPosts.map(post => post.id));
        const dedupedIncoming = incoming.filter(post => !seen.has(post.id));
        return [...prevPosts, ...dedupedIncoming];
      });
      setHasMore(Boolean(payload.hasMore));
      setNextOffset(prevOffset => (
        Number.isInteger(payload.nextOffset) ? payload.nextOffset : prevOffset + incoming.length
      ));
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, nextOffset, search]);

  const patchVisiblePost = useCallback((postId, patchOrUpdater) => {
    setVisiblePosts(previous => previous.map(post => {
      if (post.id !== postId) return post;

      if (typeof patchOrUpdater === "function")
        return patchOrUpdater(post);

      return { ...post, ...patchOrUpdater };
    }));
  }, []);

  useEffect(() => {
    if (!hasMore || isLoadingMore) return;
    if (!contentRef.current || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return;
        loadMore();
      },
      {
        root: contentRef.current,
        rootMargin: "300px 0px",
      }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  return {
    contentRef,
    sentinelRef,
    visiblePosts,
    patchVisiblePost,
    hasMore,
    isLoadingMore,
    loadMore,
  };
}
