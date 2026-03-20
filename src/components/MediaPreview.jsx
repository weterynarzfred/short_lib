import { useEffect, useState } from "react";
import classNames from "classnames";
import mimetypeToType from "@/app/api/upload/mimetypeToType";

import styles from "./MediaPreview.module.scss";

export default function MediaPreview({ src, mime_type, mediaRef, settings, className, onEnded }) {
  const mimeType = typeof mime_type === "string" ? mime_type : "";
  const mediaType = mimetypeToType(mimeType);
  const [textValue, setTextValue] = useState("");
  const [textStatus, setTextStatus] = useState("idle");

  useEffect(() => {
    if (mediaType !== "text") {
      setTextStatus("idle");
      setTextValue("");
      return;
    }

    if (!src) {
      setTextStatus("error");
      setTextValue("");
      return;
    }

    const abortController = new AbortController();
    setTextStatus("loading");
    setTextValue("");

    fetch(`/api/media/${src}`, { signal: abortController.signal })
      .then(async response => {
        if (!response.ok)
          throw new Error(`Failed to load text preview (${response.status})`);
        const body = await response.text();
        if (!abortController.signal.aborted) {
          setTextValue(body);
          setTextStatus("ready");
        }
      })
      .catch(() => {
        if (abortController.signal.aborted) return;
        setTextStatus("error");
      });

    return () => abortController.abort();
  }, [mediaType, src]);

  return <div className={classNames(styles.mediaPreview, className)}>
    {mediaType === "image" && <img
      src={`/api/media/${src}`}
      ref={mediaRef}
      tabIndex={0}
      alt=""
    />}

    {mediaType === "video" && <video
      src={`/api/media/${src}`}
      autoPlay={settings.autoplay || settings.slideshow}
      controls
      loop={settings.loop && !settings.slideshow}
      muted={settings.muted}
      ref={mediaRef}
      tabIndex={0}
      onEnded={onEnded}
    />}

    {mediaType === "audio" && <audio
      src={`/api/media/${src}`}
      autoPlay={settings.autoplay || settings.slideshow}
      controls
      loop={settings.loop && !settings.slideshow}
      muted={settings.muted}
      ref={mediaRef}
      tabIndex={0}
      onEnded={onEnded}
    />}

    {mediaType === "text" && <div
      ref={mediaRef}
      tabIndex={0}
      className={styles.textPreview}
    >
      {textStatus === "loading" ? "loading text..." : null}
      {textStatus === "error" ? "failed to load text preview" : null}
      {textStatus === "ready" ? textValue : null}
    </div>}
  </div>;
}
