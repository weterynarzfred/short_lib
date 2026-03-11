"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";

import PostItem from "./PostItem";
import Search from "./Search";
import MediaPanel from "./MediaPanel";

import styles from "./MediaListing.module.scss";

const SUPPORTED_MEDIA_TYPES = new Set(["image", "video", "audio"]);

export default function MediaListing({
  posts,
  search,
  mediaSettings,
  initialHasMore = false,
  initialNextOffset = 0,
}) {
  const mediaRef = useRef(null);
  const contentRef = useRef(null);
  const sentinelRef = useRef(null);
  const latestSearchRef = useRef(search);

  const [visiblePosts, setVisiblePosts] = useState(posts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activePostId, setActivePostId] = useState(null);

  useEffect(() => {
    latestSearchRef.current = search;
  }, [search]);

  useEffect(() => {
    setVisiblePosts(posts);
    setHasMore(initialHasMore);
    setNextOffset(initialNextOffset);
  }, [posts, initialHasMore, initialNextOffset]);

  const supported = useMemo(
    () => visiblePosts.filter(post => {
      const mediaType = post?.mime_type?.split("/")?.[0];
      return SUPPORTED_MEDIA_TYPES.has(mediaType);
    }),
    [visiblePosts]
  );

  const active = useMemo(
    () => supported.find(post => post.id === activePostId) ?? null,
    [supported, activePostId]
  );

  const close = useCallback(() => setActivePostId(null), []);
  const open = useCallback(id => setActivePostId(id), []);

  const prev = useCallback(() => {
    setActivePostId(currentId => {
      if (currentId == null || supported.length < 2) return currentId;

      const index = supported.findIndex(post => post.id === currentId);
      if (index === -1) return null;

      const nextIndex = index === 0 ? supported.length - 1 : index - 1;
      return supported[nextIndex]?.id ?? null;
    });
  }, [supported]);

  const next = useCallback(() => {
    setActivePostId(currentId => {
      if (currentId == null || supported.length < 2) return currentId;

      const index = supported.findIndex(post => post.id === currentId);
      if (index === -1) return null;

      const nextIndex = index === supported.length - 1 ? 0 : index + 1;
      return supported[nextIndex]?.id ?? null;
    });
  }, [supported]);

  useEffect(() => {
    if (activePostId == null) return;
    if (supported.some(post => post.id === activePostId)) return;

    setActivePostId(null);
    mediaRef.current = null;
  }, [supported, activePostId]);

  useEffect(() => {
    if (!active) return;

    const handler = e => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, close, prev, next]);

  useEffect(() => {
    if (active && mediaRef.current) mediaRef.current.focus();
  }, [active?.id]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    const requestSearch = search;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (requestSearch) params.set("search", requestSearch);
      params.set("offset", String(nextOffset));

      const res = await fetch(`/api/listing?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Failed to load more posts (${res.status})`);

      const payload = await res.json();
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

  return (
    <>
      <div className={styles.MediaListing}>
        <div
          ref={contentRef}
          className={`content content--full ${styles.content}`}
        >
          <h1>media listing</h1>
          <Search initialValue={search} />
          <div className={styles.list}>
            {visiblePosts.map(post =>
              <PostItem key={post.id} post={post} openMediaPanel={open} />
            )}
          </div>

          <div className={styles.loadMore}>
            {hasMore && (
              <button
                type="button"
                className={styles.loadMoreButton}
                disabled={isLoadingMore}
                onClick={loadMore}
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

        <div className={classNames(styles.sidebar, { [styles.sidebarActive]: !!active })}>
          {active && <MediaPanel
            post={active}
            close={close}
            prev={prev}
            next={next}
            mediaRef={mediaRef}
            initialSettings={mediaSettings}
          />}
        </div>
      </div>
    </>
  );
}
