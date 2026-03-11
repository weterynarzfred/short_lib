import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import classNames from "classnames";
import MediaPanelMeta from "./MediaPanelMeta";
import MediaPreview from "../../../components/MediaPreview";
import { updateMediaSettingsAction } from "@/lib/actions";

import styles from "./MediaPanel.module.scss";

const DEFAULT_TOGGLES = {
  autoplay: false,
  loop: false,
  slideshow: false,
  muted: false,
  fullscreen: false
};
const IMAGE_SLIDESHOW_DELAY_MS = 4000;

function isEditorFocused() {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return Boolean(active.closest("input, textarea, select, [contenteditable='true']"));
}

export default function MediaPanel({ post, close, prev, next, mediaRef, initialSettings }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [toggles, setToggles] = useState({
    ...DEFAULT_TOGGLES,
    ...initialSettings,
  });
  const retryAdvanceTimerRef = useRef(null);
  const imageSlideshowTimerRef = useRef(null);
  const slideshowEnabledRef = useRef(toggles.slideshow);
  const currentPostIdRef = useRef(post?.id ?? null);

  const clearRetryAdvanceTimer = useCallback(() => {
    if (!retryAdvanceTimerRef.current) return;
    clearTimeout(retryAdvanceTimerRef.current);
    retryAdvanceTimerRef.current = null;
  }, []);

  const clearImageSlideshowTimer = useCallback(() => {
    if (!imageSlideshowTimerRef.current) return;
    clearTimeout(imageSlideshowTimerRef.current);
    imageSlideshowTimerRef.current = null;
  }, []);

  useEffect(() => {
    slideshowEnabledRef.current = toggles.slideshow;
  }, [toggles.slideshow]);

  useEffect(() => {
    currentPostIdRef.current = post?.id ?? null;
  }, [post?.id]);

  const tryAdvance = useCallback((expectedPostId) => {
    if (!slideshowEnabledRef.current) return true;
    if (currentPostIdRef.current !== expectedPostId) return true;
    if (isEditorFocused()) return false;

    next();
    return true;
  }, [next]);

  const scheduleAdvanceRetry = useCallback((expectedPostId) => {
    clearRetryAdvanceTimer();

    const tick = () => {
      if (tryAdvance(expectedPostId)) {
        retryAdvanceTimerRef.current = null;
        return;
      }

      retryAdvanceTimerRef.current = setTimeout(tick, 300);
    };

    retryAdvanceTimerRef.current = setTimeout(tick, 300);
  }, [clearRetryAdvanceTimer, tryAdvance]);

  function toggleOption(key) {
    const nextValue = !toggles[key];
    setToggles(prev => ({ ...prev, [key]: nextValue }));

    startTransition(() => {
      updateMediaSettingsAction({ [key]: nextValue });
    });
  }

  const handleMediaEnded = useCallback(() => {
    if (!toggles.slideshow) return;
    const expectedPostId = post?.id ?? null;
    if (expectedPostId == null) return;
    if (!tryAdvance(expectedPostId)) scheduleAdvanceRetry(expectedPostId);
  }, [toggles.slideshow, post?.id, scheduleAdvanceRetry, tryAdvance]);

  useEffect(() => {
    clearImageSlideshowTimer();
    clearRetryAdvanceTimer();

    if (!toggles.slideshow) return;
    if (!post?.mime_type?.startsWith("image")) return;

    const expectedPostId = post.id;

    const tick = () => {
      if (tryAdvance(expectedPostId)) {
        imageSlideshowTimerRef.current = null;
        return;
      }

      imageSlideshowTimerRef.current = setTimeout(tick, 300);
    };

    imageSlideshowTimerRef.current = setTimeout(tick, IMAGE_SLIDESHOW_DELAY_MS);

    return () => {
      clearImageSlideshowTimer();
      clearRetryAdvanceTimer();
    };
  }, [
    toggles.slideshow,
    post?.id,
    post?.mime_type,
    clearImageSlideshowTimer,
    clearRetryAdvanceTimer,
    tryAdvance,
  ]);

  useEffect(() => () => {
    clearImageSlideshowTimer();
    clearRetryAdvanceTimer();
  }, [clearImageSlideshowTimer, clearRetryAdvanceTimer]);

  return (
    <div
      className={classNames(styles.MediaPanel, {
        [styles.MediaPanelFullscreen]: toggles.fullscreen,
      })}
    >
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
        className={classNames({
          [styles.MediaPanel__previewFullscreen]: toggles.fullscreen,
        })}
        onEnded={handleMediaEnded}
      />

      <MediaPanelMeta
        post={post}
        prev={prev}
        next={next}
        isSlideshowOn={toggles.slideshow}
        className={classNames({
          [styles.MediaPanel__metaFullscreen]: toggles.fullscreen,
        })}
      />
    </div>
  );
}
