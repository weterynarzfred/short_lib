import { useState } from "react";

import { deletePostAction } from "@/lib/actions";

import styles from "./MediaPanel.module.scss";

export default function MediaPanel({ post, close, prev, next, mediaRef }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

      <div className={styles.navigation}>
        <button className={styles.MediaPanel__prev} onClick={prev}>
          ←
        </button>
        <button className={styles.MediaPanel__next} onClick={next}>
          →
        </button>
      </div>

      <div className={styles.actions}>
        {!confirmingDelete && (
          <button
            className={styles.deleteButton}
            onClick={() => setConfirmingDelete(true)}
          >
            delete
          </button>
        )}

        {confirmingDelete && (
          <>
            <button className={styles.button} onClick={() => setConfirmingDelete(true)}>
              cancel
            </button>
            <button className={styles.deleteButton} onClick={async () => {
              await deletePostAction(post.id);
              setConfirmingDelete(false);
            }}>
              confirm
            </button>
          </>
        )}
      </div>
    </div>
  );
}
