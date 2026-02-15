"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import PostItem from "./PostItem";

import "./MediaListing.scss";

export default function MediaListing({ posts }) {
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
    if (active && mediaRef.current)
      mediaRef.current.focus();
  }, [active]);

  return (
    <>
      <div className="media-listing">
        {posts.map(post =>
          <PostItem key={post.id} post={post} openLightbox={open} />
        )}
      </div>

      {active && (
        <div className="lightbox">
          <button className="lightbox__close" onClick={close}>×</button>
          <button className="lightbox__prev" onClick={prev}>←</button>

          <div className="lightbox__content">
            {active.mime_type.startsWith("image") && (
              <img
                src={`/api/media/${active.file_path}`}
                ref={mediaRef}
                tabIndex={0}
              />
            )}

            {active.mime_type.startsWith("video") && (
              <video
                src={`/api/media/${active.file_path}`}
                autoPlay
                controls
                onEnded={next}
                ref={mediaRef}
                tabIndex={0}
              />
            )}

            {active.mime_type.startsWith("audio") && (
              <audio
                src={`/api/media/${active.file_path}`}
                autoPlay
                controls
                onEnded={next}
                ref={mediaRef}
                tabIndex={0}
              />
            )}
          </div>

          <button className="lightbox__next" onClick={next}>→</button>
        </div>
      )}
    </>
  );
}
