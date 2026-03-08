import styles from "./MediaPreview.module.scss";

export default function MediaPreview({ src, mime_type, mediaRef }) {
  return <div className={styles.MediaPreview}>
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
        autoPlay
        controls
        // onEnded={next}
        loop
        ref={mediaRef}
        tabIndex={0}
      />
    )}

    {mime_type.startsWith("audio") && (
      <audio
        src={`/api/media/${src}`}
        autoPlay
        controls
        // onEnded={next}
        loop
        ref={mediaRef}
        tabIndex={0}
      />
    )}
  </div>;
}
