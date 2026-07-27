"use client";

import { useEffect } from "react";

import parseTagToken from "@/lib/parseTagToken";
import { useTagTooltip } from "@/components/TagTooltipProvider";

// The highlighted layer sits under a transparent textarea and is `pointer-events: none`,
// so the spans never receive a hover of their own. Enabling pointer events on them would
// hand them the click too, and the caret would stop following the mouse.
//
// Instead the pointer is tracked on the textarea - which already gets every event - and
// hit-tested against the token rects. The mirrored layout is pixel-exact, so the span
// under the pointer is the token under the caret. Nothing about clicking changes.
export default function useTagTokenHover(containerRef, textareaRef, { enabled = true } = {}) {
  const { showTagTooltip, hideTagTooltip, cancelTagTooltip } = useTagTooltip();

  useEffect(() => {
    const container = containerRef.current;
    const textarea = textareaRef.current;
    if (!enabled || !container || !textarea) return;

    const controller = new AbortController();
    const { signal } = controller;

    let frame = 0;
    let hoveredSpan = null;

    const findTokenAt = (x, y) => {
      for (const span of container.querySelectorAll("span.token")) {
        const rect = span.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
          return span;
      }

      return null;
    };

    const handleMove = event => {
      if (frame) return;

      // One hit test per frame: a rect read per span is cheap, but not per mouse event.
      frame = requestAnimationFrame(() => {
        frame = 0;

        const span = findTokenAt(event.clientX, event.clientY);
        if (span === hoveredSpan) return;

        hoveredSpan = span;

        // Only abandons a hover that has not opened yet. An open card closes itself once
        // the pointer is genuinely away from both it and its tag.
        const { name } = span ? parseTagToken(span.textContent) : {};
        if (!name) {
          cancelTagTooltip();
          return;
        }

        showTagTooltip(name, span.getBoundingClientRect());
      });
    };

    const handleLeave = () => {
      hoveredSpan = null;
      cancelTagTooltip();
    };

    textarea.addEventListener("mousemove", handleMove, { signal, passive: true });
    textarea.addEventListener("mouseleave", handleLeave, { signal, passive: true });

    return () => {
      controller.abort();
      if (frame) cancelAnimationFrame(frame);
      hideTagTooltip();
    };
  }, [containerRef, textareaRef, enabled, showTagTooltip, hideTagTooltip, cancelTagTooltip]);
}
