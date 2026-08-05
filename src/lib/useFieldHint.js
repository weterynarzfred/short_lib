"use client";

import { useCallback } from "react";

import { TOOLTIP_SOURCES, useTooltip } from "@/components/TooltipProvider";

// Explanatory text for a control, opened by hover *or* keyboard focus. Focus matters here
// more than anywhere else: these hints exist so a field can offer its full range and
// explain what the extremes cost, and a keyboard user never triggers hover at all.
//
// Returns props to spread onto the control (or its label).
export default function useFieldHint() {
  const { showTooltip, hideTooltip, cancelTooltip } = useTooltip();

  return useCallback(content => {
    if (!content) return {};

    const open = (event, source) => showTooltip({
      rect: event.currentTarget.getBoundingClientRect(),
      content,
      source,
    });

    return {
      onMouseEnter: event => open(event, TOOLTIP_SOURCES.hover),
      // Pending hover only; an open card closes itself when the pointer truly leaves.
      onMouseLeave: () => cancelTooltip(),
      onFocus: event => open(event, TOOLTIP_SOURCES.focus),
      // The counterpart to focus. No pointer movement will ever dismiss a card the
      // keyboard opened, so leaving the field has to.
      onBlur: () => hideTooltip(),
    };
  }, [showTooltip, hideTooltip, cancelTooltip]);
}
