import { useState, useTransition } from "react";
import MediaPanelMeta from "./MediaPanelMeta";
import MediaPreview from "./MediaPreview";
import { updateMediaSettingsAction } from "@/lib/actions";

import styles from "./MediaPanel.module.scss";

// TODO: make slideshow option move to the next post when the current
// audio/video ends, in case of images, move after 4 seconds. Don't move if the
// tag editor textarea (or other inputs once implemented) is focused.
// TODO: make fullscreen switch the media panel to take the whole screen, in
// this case the media preview should take the entire screen with
// object-fit: contain. Meta should still be there, accessible after scrolling
const DEFAULT_TOGGLES = {
  autoplay: false,
  loop: false,
  slideshow: false,
  muted: false,
  fullscreen: false
};

export default function MediaPanel({ post, close, prev, next, mediaRef, initialSettings }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [toggles, setToggles] = useState({
    ...DEFAULT_TOGGLES,
    ...initialSettings,
  });

  function toggleOption(key) {
    const nextValue = !toggles[key];
    setToggles(prev => ({ ...prev, [key]: nextValue }));

    startTransition(() => {
      updateMediaSettingsAction({ [key]: nextValue });
    });
  }

  return (
    <div className={styles.MediaPanel}>
      <div className={styles.MediaPanel__controls}>
        <button
          className={styles.MediaPanel__burger}
          onClick={() => setMenuOpen(v => !v)}
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
        settings={toggles}
      />

      <MediaPanelMeta
        post={post}
        prev={prev}
        next={next}
      />
    </div>
  );
}
