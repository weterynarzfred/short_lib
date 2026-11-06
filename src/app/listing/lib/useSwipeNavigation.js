import { useRef } from "react";

const MIN_DISTANCE = 60;
// Native video controls sit along the bottom edge, and dragging there seeks.
const VIDEO_CONTROLS_HEIGHT = 56;

// Swiping left or right on the media steps to the next or previous post. The swipe has to
// be clearly sideways, so scrolling down to the editors never turns into navigation, and it
// is ignored while pinch-zoomed, where a sideways drag pans the image.
export default function useSwipeNavigation({ prev, next }) {
  const startRef = useRef(null);

  const onTouchStart = event => {
    startRef.current = null;
    if (event.touches.length !== 1 || window.visualViewport?.scale > 1) return;

    const touch = event.touches[0];
    const video = event.target.closest("video");
    if (video && touch.clientY > video.getBoundingClientRect().bottom - VIDEO_CONTROLS_HEIGHT)
      return;

    startRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = event => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2) return;

    if (dx < 0) next();
    else prev();
  };

  return { onTouchStart, onTouchEnd };
}
