"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

import isWithinRect from "@/lib/isWithinRect";

import styles from "./TooltipProvider.module.scss";

const TooltipContext = createContext(null);

const NO_PROVIDER = {
  showTooltip: () => { },
  hideTooltip: () => { },
  cancelTooltip: () => { },
};

// Long enough that dragging the pointer across a row of controls does not fire a request
// per item, short enough to feel like a hover.
const SHOW_DELAY_MS = 300;
// Slack around the anchor and the card, so the few pixels between them are not a dead zone
// the pointer can fall through.
const KEEP_OPEN_PADDING = 12;

export const TOOLTIP_SOURCES = { hover: "hover", focus: "focus" };

// One tooltip for the whole app, positioned `fixed` from a viewport rect. Fixed rather
// than absolute because some anchors live inside containers that clip their overflow - the
// tag editor's mount does - and an absolutely positioned card would be cut off.
//
// Content is supplied by the caller, either directly or through `load` for anything that
// has to be fetched. The provider owns placement, timing and dismissal; it knows nothing
// about tags, fields, or anything else it is describing.
export function TooltipProvider({ children }) {
  const [state, setState] = useState(null);
  const pathname = usePathname();

  const cacheRef = useRef(new Map());
  const inFlightRef = useRef(new Map());
  const showTimerRef = useRef(null);
  const requestRef = useRef(0);

  const loadContent = useCallback(async (cacheKey, load) => {
    const cache = cacheRef.current;
    if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);

    const inFlight = inFlightRef.current;
    if (cacheKey && inFlight.has(cacheKey)) return inFlight.get(cacheKey);

    const request = Promise.resolve()
      .then(load)
      .then(content => {
        if (cacheKey) cache.set(cacheKey, content);
        return content;
      })
      .catch(() => null)
      .finally(() => {
        if (cacheKey) inFlight.delete(cacheKey);
      });

    if (cacheKey) inFlight.set(cacheKey, request);
    return request;
  }, []);

  // Closes whatever is open and abandons anything pending.
  const hideTooltip = useCallback(() => {
    clearTimeout(showTimerRef.current);
    requestRef.current += 1;
    setState(null);
  }, []);

  // Drops a hover that has not resolved yet without touching an open card. Leaving an
  // anchor must not close the card, or its links could never be reached - the pointer
  // watcher in TooltipCard decides when the card has really been left.
  const cancelTooltip = useCallback(() => {
    clearTimeout(showTimerRef.current);
    requestRef.current += 1;
  }, []);

  // How an open card dismisses itself. It must not use `hideTooltip`: moving the pointer
  // from one anchor straight onto the next fires the old card's watcher *after* the new
  // anchor has already scheduled its request, and a full hide would clear that timer and
  // bump the request counter - which is why every second hover did nothing.
  const closeCard = useCallback(requestId => {
    if (requestId === requestRef.current) hideTooltip();
    else setState(null);
  }, [hideTooltip]);

  const showTooltip = useCallback(({
    rect,
    content = null,
    load = null,
    cacheKey = null,
    source = TOOLTIP_SOURCES.hover,
    delay = SHOW_DELAY_MS,
  }) => {
    if (!rect || (!content && !load)) return;

    clearTimeout(showTimerRef.current);

    const requestId = ++requestRef.current;
    const anchor = {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    };

    const open = async () => {
      const resolved = load ? await loadContent(cacheKey, load) : content;
      // A later request, or a hide, happened while this was in flight.
      if (requestId !== requestRef.current || !resolved) return;

      setState({ content: resolved, anchor, source, requestId });
    };

    // Keyboard focus is already a deliberate act, so it should not also wait out a delay
    // meant to filter accidental pointer passes.
    if (source === TOOLTIP_SOURCES.focus || delay <= 0) open();
    else showTimerRef.current = setTimeout(open, delay);
  }, [loadContent]);

  // Any scroll moves the anchor out from under the card, and there is no cheap way to
  // follow it, so close instead of drifting.
  useEffect(() => {
    if (!state) return;

    window.addEventListener("scroll", hideTooltip, { capture: true, passive: true });
    window.addEventListener("resize", hideTooltip, { passive: true });

    return () => {
      window.removeEventListener("scroll", hideTooltip, { capture: true });
      window.removeEventListener("resize", hideTooltip);
    };
  }, [state, hideTooltip]);

  // The keyboard's way out. Needed most for focus-opened cards, which no pointer movement
  // will ever dismiss.
  useEffect(() => {
    if (!state) return;

    const onKeyDown = event => {
      if (event.key === "Escape") hideTooltip();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, hideTooltip]);

  // Navigating away leaves the card describing something from a page that is gone, and the
  // pointer watcher would not close it until the mouse happened to move.
  useEffect(() => {
    hideTooltip();
  }, [pathname, hideTooltip]);

  useEffect(() => () => clearTimeout(showTimerRef.current), []);

  const value = useMemo(
    () => ({ showTooltip, hideTooltip, cancelTooltip }),
    [showTooltip, hideTooltip, cancelTooltip]
  );

  return (
    <TooltipContext.Provider value={value}>
      {children}
      {state ? (
        <TooltipCard
          content={state.content}
          anchor={state.anchor}
          source={state.source}
          onClose={() => closeCard(state.requestId)}
        />
      ) : null}
    </TooltipContext.Provider>
  );
}

function TooltipCard({ content, anchor, source, onClose }) {
  const cardRef = useRef(null);
  // Null means "not measured yet", which is also how the card is rendered for measuring.
  const [placement, setPlacement] = useState(null);

  // Closing is decided by where the pointer actually is, not by enter/leave events on the
  // anchor, which are unreliable across the gap between two separate parts of the tree.
  //
  // Only for hover: a card opened by keyboard focus must survive the mouse sitting
  // somewhere else entirely, and is dismissed by blur or Escape instead.
  useEffect(() => {
    if (source !== TOOLTIP_SOURCES.hover) return;

    const handleMove = event => {
      const card = cardRef.current;
      if (!card) return;

      const { clientX: x, clientY: y } = event;
      if (isWithinRect(anchor, x, y, KEEP_OPEN_PADDING)) return;
      if (isWithinRect(card.getBoundingClientRect(), x, y, KEEP_OPEN_PADDING)) return;

      onClose();
    };

    document.addEventListener("mousemove", handleMove, { passive: true });
    return () => document.removeEventListener("mousemove", handleMove);
  }, [anchor, source, onClose]);

  // A new anchor or new content invalidates the measurement, so go back through the
  // measuring pass rather than keeping a position derived from the old size.
  useLayoutEffect(() => {
    setPlacement(null);
  }, [anchor, content]);

  // Flipping and clamping need the rendered size, so the card is laid out once before it
  // is placed. It has to be measured at the left edge: a fixed element with no `right` is
  // shrink-to-fit, capped by the space between its `left` and the viewport edge, so an
  // anchor near the right edge would measure as a thin column - and then get clamped using
  // that squeezed width, which is exactly the wrong number.
  useLayoutEffect(() => {
    if (placement) return;

    const card = cardRef.current;
    if (!card) return;

    const { width, height } = card.getBoundingClientRect();
    const margin = 8;

    const fitsBelow = anchor.bottom + height + margin <= window.innerHeight;
    const top = fitsBelow ? anchor.bottom + 6 : Math.max(margin, anchor.top - height - 6);
    const left = Math.min(
      Math.max(margin, anchor.left),
      Math.max(margin, window.innerWidth - width - margin)
    );

    setPlacement({ top, left });
  }, [placement, anchor, content]);

  return (
    <div
      ref={cardRef}
      className={styles.tooltip}
      style={placement
        ? { top: `${placement.top}px`, left: `${placement.left}px` }
        // Off the left edge and hidden: full viewport width to grow into, and never a
        // visible frame in the wrong place.
        : { top: "0px", left: "0px", visibility: "hidden" }}
      role="tooltip"
    >
      {content}
    </div>
  );
}

export function useTooltip() {
  return useContext(TooltipContext) ?? NO_PROVIDER;
}
