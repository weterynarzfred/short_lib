"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import "./MediaListing.scss";

export default function MediaListing({ posts }) {
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

  return (
    <>
      <div className="media-listing">
        {posts.map(post => (
          <div
            key={post.id}
            className="media-listing__item"
            onClick={() => open(post.id)}
          >
            <Image
              src={`/api/media/${post.file_path}?size=thumb`}
              width={post.variants.thumb.width}
              height={post.variants.thumb.height}
              alt=""
            />
          </div>
        ))}
      </div>

      {active && (
        <div className="lightbox">
          <button className="lightbox__close" onClick={close}>×</button>
          <button className="lightbox__prev" onClick={prev}>←</button>

          <div className="lightbox__content">
            {active.mime_type.startsWith("image") && (
              <img src={`/api/media/${active.file_path}`} />
            )}

            {active.mime_type.startsWith("video") && (
              <video
                src={`/api/media/${active.file_path}`}
                autoPlay
                loop
                controls
              />
            )}

            {active.mime_type.startsWith("audio") && (
              <audio
                src={`/api/media/${active.file_path}`}
                autoPlay
                loop
                controls
              />
            )}
          </div>

          <button className="lightbox__next" onClick={next}>→</button>
        </div>
      )}
    </>
  );
}
