import classNames from "classnames";

import styles from "./MediaPreview.module.scss";

export default function MediaPreview({ src, mime_type, mediaRef, settings, className, onEnded }) {
  return <div className={classNames(styles.mediaPreview, className)}>
    {mime_type.startsWith("image") && (
      <img
        src={`/api/media/${src}`}
        ref={mediaRef}
        tabIndex={0}
        alt=""
      />
    )}

    {mime_type.startsWith("video") && (
      <video
        src={`/api/media/${src}`}
        autoPlay={settings.autoplay || settings.slideshow}
        controls
        loop={settings.loop && !settings.slideshow}
        muted={settings.muted}
        ref={mediaRef}
        tabIndex={0}
        onEnded={onEnded}
      />
    )}

    {mime_type.startsWith("audio") && (
      <audio
        src={`/api/media/${src}`}
        autoPlay={settings.autoplay || settings.slideshow}
        controls
        loop={settings.loop && !settings.slideshow}
        muted={settings.muted}
        ref={mediaRef}
        tabIndex={0}
        onEnded={onEnded}
      />
    )}
  </div>;
}
