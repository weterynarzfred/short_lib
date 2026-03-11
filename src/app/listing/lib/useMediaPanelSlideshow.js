import { useCallback, useEffect, useRef } from "react";

const IMAGE_SLIDESHOW_DELAY_MS = 4000;
const RETRY_ADVANCE_DELAY_MS = 300;

function isEditorFocused() {
  if (typeof document === "undefined") return false;
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;
  return Boolean(activeElement.closest("input, textarea, select, [contenteditable='true']"));
}

export default function useMediaPanelSlideshow({ isSlideshowOn, postId, mimeType, onAdvance }) {
  const retryAdvanceTimerRef = useRef(null);
  const imageSlideshowTimerRef = useRef(null);
  const slideshowEnabledRef = useRef(isSlideshowOn);
  const currentPostIdRef = useRef(postId ?? null);

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
    slideshowEnabledRef.current = isSlideshowOn;
  }, [isSlideshowOn]);

  useEffect(() => {
    currentPostIdRef.current = postId ?? null;
  }, [postId]);

  const tryAdvance = useCallback((expectedPostId) => {
    if (!slideshowEnabledRef.current) return true;
    if (currentPostIdRef.current !== expectedPostId) return true;
    if (isEditorFocused()) return false;

    onAdvance();
    return true;
  }, [onAdvance]);

  const scheduleAdvanceRetry = useCallback((expectedPostId) => {
    clearRetryAdvanceTimer();

    const tick = () => {
      if (tryAdvance(expectedPostId)) {
        retryAdvanceTimerRef.current = null;
        return;
      }

      retryAdvanceTimerRef.current = setTimeout(tick, RETRY_ADVANCE_DELAY_MS);
    };

    retryAdvanceTimerRef.current = setTimeout(tick, RETRY_ADVANCE_DELAY_MS);
  }, [clearRetryAdvanceTimer, tryAdvance]);

  const handleMediaEnded = useCallback(() => {
    if (!isSlideshowOn) return;
    if (postId == null) return;
    if (!tryAdvance(postId)) scheduleAdvanceRetry(postId);
  }, [isSlideshowOn, postId, scheduleAdvanceRetry, tryAdvance]);

  useEffect(() => {
    clearImageSlideshowTimer();
    clearRetryAdvanceTimer();

    if (!isSlideshowOn) return;
    if (!mimeType?.startsWith("image")) return;
    if (postId == null) return;

    const expectedPostId = postId;

    const tick = () => {
      if (tryAdvance(expectedPostId)) {
        imageSlideshowTimerRef.current = null;
        return;
      }

      imageSlideshowTimerRef.current = setTimeout(tick, RETRY_ADVANCE_DELAY_MS);
    };

    imageSlideshowTimerRef.current = setTimeout(tick, IMAGE_SLIDESHOW_DELAY_MS);

    return () => {
      clearImageSlideshowTimer();
      clearRetryAdvanceTimer();
    };
  }, [
    isSlideshowOn,
    postId,
    mimeType,
    clearImageSlideshowTimer,
    clearRetryAdvanceTimer,
    tryAdvance,
  ]);

  useEffect(() => () => {
    clearImageSlideshowTimer();
    clearRetryAdvanceTimer();
  }, [clearImageSlideshowTimer, clearRetryAdvanceTimer]);

  return { handleMediaEnded };
}
