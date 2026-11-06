import { useEffect, useRef } from "react";
import isEditableTarget from "@/lib/isEditableTarget";
import mimetypeToType from "@/lib/mimetypeToType";

const IMAGE_SLIDESHOW_DELAY_MS = 4000;
const RETRY_ADVANCE_DELAY_MS = 300;

export default function useMediaPanelSlideshow({ isSlideshowOn, postId, mimeType, onAdvance }) {
  const retryAdvanceTimerRef = useRef(null);
  const imageSlideshowTimerRef = useRef(null);
  const slideshowEnabledRef = useRef(isSlideshowOn);
  const currentPostIdRef = useRef(postId);

  const clearRetryAdvanceTimer = () => {
    clearTimeout(retryAdvanceTimerRef.current);
    retryAdvanceTimerRef.current = null;
  };

  const clearImageSlideshowTimer = () => {
    clearTimeout(imageSlideshowTimerRef.current);
    imageSlideshowTimerRef.current = null;
  };

  useEffect(() => {
    slideshowEnabledRef.current = isSlideshowOn;
  }, [isSlideshowOn]);

  useEffect(() => {
    currentPostIdRef.current = postId;
  }, [postId]);

  // Holds off while a field has focus, so the post does not change under your typing.
  const tryAdvance = expectedPostId => {
    if (!slideshowEnabledRef.current) return true;
    if (currentPostIdRef.current !== expectedPostId) return true;
    if (isEditableTarget(document.activeElement)) return false;

    onAdvance();
    return true;
  };

  const scheduleAdvanceRetry = expectedPostId => {
    clearRetryAdvanceTimer();

    const tick = () => {
      if (tryAdvance(expectedPostId)) {
        retryAdvanceTimerRef.current = null;
        return;
      }

      retryAdvanceTimerRef.current = setTimeout(tick, RETRY_ADVANCE_DELAY_MS);
    };

    retryAdvanceTimerRef.current = setTimeout(tick, RETRY_ADVANCE_DELAY_MS);
  };

  const handleMediaEnded = () => {
    if (isSlideshowOn && !tryAdvance(postId)) scheduleAdvanceRetry(postId);
  };

  useEffect(() => {
    clearImageSlideshowTimer();
    clearRetryAdvanceTimer();

    if (!isSlideshowOn) return;
    const mediaType = mimetypeToType(mimeType);
    if (mediaType === "video" || mediaType === "audio") return;

    const tick = () => {
      if (tryAdvance(postId)) {
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
  }, [isSlideshowOn, postId, mimeType, clearImageSlideshowTimer, clearRetryAdvanceTimer, tryAdvance]);

  useEffect(() => () => {
    clearImageSlideshowTimer();
    clearRetryAdvanceTimer();
  }, [clearImageSlideshowTimer, clearRetryAdvanceTimer]);

  return { handleMediaEnded };
}
