"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import PostItem from "./PostItem";
import Search from "./Search";
import MediaPanel from "./MediaPanel";

import styles from "./MediaListing.module.scss";
import classNames from "classnames";

export default function MediaListing({ posts, search }) {
  const mediaRef = useRef(null);

  const supported = useMemo(
    () => posts.filter(p => ["image", "video", "audio"]
      .includes(p.mime_type.split('/')[0])),
    [posts]
  );

  const [index, setIndex] = useState(null);

  const close = () => setIndex(null);
  const open = id => setIndex(supported.findIndex(p => p.id === id));
  const prev = () =>
    setIndex(i => (i === 0 ? supported.length - 1 : i - 1));
  const next = () =>
    setIndex(i => (i === supported.length - 1 ? 0 : i + 1));

  useEffect(() => {
    if (index === null) return;

    const handler = e => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index]);

  const active = index !== null ? supported[index] : null;

  useEffect(() => {
    if (active && mediaRef.current) mediaRef.current.focus();
  }, [active]);

  return (
    <>
      <div className={styles.MediaListing}>
        <div className={`content content--full ${styles.content}`}>
          <h1>media listing</h1>
          <Search initialValue={search} />
          <div className={styles.list}>
            {posts.map(post =>
              <PostItem key={post.id} post={post} openMediaPanel={open} />
            )}
          </div>
        </div>

        <div className={classNames(styles.sidebar, { [styles.sidebarActive]: !!active })}>
          {active && <MediaPanel
            post={active}
            close={close}
            prev={prev}
            next={next}
            mediaRef={mediaRef}
          />}
        </div>
      </div>
    </>
  );
}
