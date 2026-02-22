import MediaPanelMeta from "@/app/listing/MediaPanelMeta";
import styles from "./MediaPanel.module.scss";

export default function MediaPanel({ post, close, prev, next, mediaRef }) {

  return (
    <div className={styles.MediaPanel}>
      <button className={styles.MediaPanel__close} onClick={close}>
        ×
      </button>

      <div className={styles.MediaPanel__media}>
        {post.mime_type.startsWith("image") && (
          <img
            src={`/api/media/${post.file_path}`}
            ref={mediaRef}
            tabIndex={0}
            alt=""
          />
        )}

        {post.mime_type.startsWith("video") && (
          <video
            src={`/api/media/${post.file_path}`}
            autoPlay
            controls
            onEnded={next}
            ref={mediaRef}
            tabIndex={0}
          />
        )}

        {post.mime_type.startsWith("audio") && (
          <audio
            src={`/api/media/${post.file_path}`}
            autoPlay
            controls
            onEnded={next}
            ref={mediaRef}
            tabIndex={0}
          />
        )}
      </div>

      <MediaPanelMeta
        post={post}
        prev={prev}
        next={next}
      />
    </div>
  );
}
