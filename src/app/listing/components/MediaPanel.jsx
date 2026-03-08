import { useState } from "react";
import MediaPanelMeta from "./MediaPanelMeta";
import MediaPreview from "./MediaPreview";

import styles from "./MediaPanel.module.scss";

export default function MediaPanel({ post, close, prev, next, mediaRef }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const [toggles, setToggles] = useState({
    autoplay: false,
    loop: false,
    slideshow: false,
    muted: false,
    fullscreen: false
  });

  function toggleOption(key) {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className={styles.MediaPanel}>
      <div className={styles.MediaPanel__controls}>
        <button
          className={styles.MediaPanel__burger}
          onClick={() => setMenuOpen((v) => !v)}
        >☰</button>

        <button
          className={styles.MediaPanel__close}
          onClick={close}
        >×</button>

        {menuOpen && (
          <div className={styles.MediaPanel__menu}>
            <label>
              <input
                type="checkbox"
                checked={toggles.autoplay}
                onChange={() => toggleOption("autoplay")}
              />
              <div className={styles.button}>autoplay</div>
            </label>

            <label>
              <input
                type="checkbox"
                checked={toggles.loop}
                onChange={() => toggleOption("loop")}
              />
              <div className={styles.button}>loop</div>
            </label>

            <label>
              <input
                type="checkbox"
                checked={toggles.slideshow}
                onChange={() => toggleOption("slideshow")}
              />
              <div className={styles.button}>slideshow</div>
            </label>

            <label>
              <input
                type="checkbox"
                checked={toggles.muted}
                onChange={() => toggleOption("muted")}
              />
              <div className={styles.button}>muted</div>
            </label>

            <label>
              <input
                type="checkbox"
                checked={toggles.fullscreen}
                onChange={() => toggleOption("fullscreen")}
              />
              <div className={styles.button}>fullscreen</div>
            </label>
          </div>
        )}
      </div>

      <MediaPreview
        src={post.file_path}
        mime_type={post.mime_type}
        mediaRef={mediaRef}
      />

      <MediaPanelMeta
        post={post}
        prev={prev}
        next={next}
      />
    </div>
  );
}
