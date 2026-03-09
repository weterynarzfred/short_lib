import classNames from "classnames";

import styles from "./MediaPreview.module.scss";

export default function MediaPreview({ src, mime_type, mediaRef, settings, className }) {
  return <div className={classNames(styles.MediaPreview, className)}>
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
        autoPlay={settings.autoplay}
        controls
        loop={settings.loop}
        muted={settings.muted}
        ref={mediaRef}
        tabIndex={0}
      />
    )}

    {mime_type.startsWith("audio") && (
      <audio
        src={`/api/media/${src}`}
        autoPlay={settings.autoplay}
        controls
        loop={settings.loop}
        muted={settings.muted}
        ref={mediaRef}
        tabIndex={0}
      />
    )}
  </div>;
}
