"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import classNames from "classnames";

import { getTagTypeClassName } from "@/lib/tagTypeOrder";
import isWithinRect from "@/lib/isWithinRect";

import styles from "./TagTooltipProvider.module.scss";

const TagTooltipContext = createContext(null);

const NO_PROVIDER = {
  showTagTooltip: () => { },
  hideTagTooltip: () => { },
  cancelTagTooltip: () => { },
};

// Long enough that dragging the pointer across a row of tags does not fire a request per
// tag, short enough to feel like a hover.
const SHOW_DELAY_MS = 300;
// Slack around the tag and the card, so the few pixels between them are not a dead zone
// the pointer can fall through.
const KEEP_OPEN_PADDING = 12;

// One tooltip for the whole app, positioned `fixed` from a viewport rect. Fixed rather
// than absolute because tag tokens live inside `.editorMount`, which clips its overflow -
// an absolutely positioned tooltip would be cut off by the editor.
export function TagTooltipProvider({ children }) {
  const [state, setState] = useState(null);
  const pathname = usePathname();

  const cacheRef = useRef(new Map());
  const inFlightRef = useRef(new Map());
  const showTimerRef = useRef(null);
  const requestRef = useRef(0);

  const clearTimers = useCallback(() => {
    clearTimeout(showTimerRef.current);
  }, []);

  const fetchTag = useCallback(async name => {
    const cache = cacheRef.current;
    if (cache.has(name)) return cache.get(name);

    const inFlight = inFlightRef.current;
    if (inFlight.has(name)) return inFlight.get(name);

    const request = fetch(`/api/tags/lookup?name=${encodeURIComponent(name)}`)
      .then(res => (res.ok ? res.json() : { tag: null }))
      .then(payload => {
        const tag = payload?.tag ?? null;
        cache.set(name, tag);
        return tag;
      })
      .catch(() => null)
      .finally(() => inFlight.delete(name));

    inFlight.set(name, request);
    return request;
  }, []);

  // Closes whatever is open and abandons anything pending.
  const hideTagTooltip = useCallback(() => {
    clearTimeout(showTimerRef.current);
    requestRef.current += 1;
    setState(null);
  }, []);

  // Drops a hover that has not resolved yet without touching an open card. Leaving a tag
  // must not close the card, or its edit link could never be reached - the pointer watcher
  // in TagTooltipCard decides when the card has really been left.
  const cancelTagTooltip = useCallback(() => {
    clearTimeout(showTimerRef.current);
    requestRef.current += 1;
  }, []);

  const showTagTooltip = useCallback((name, rect) => {
    const safeName = String(name ?? "").trim();
    if (!safeName || !rect) return;

    clearTimeout(showTimerRef.current);

    const requestId = ++requestRef.current;
    const anchor = {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    };

    showTimerRef.current = setTimeout(async () => {
      const tag = await fetchTag(safeName);
      // A later hover, or a hide, happened while this was in flight.
      if (requestId !== requestRef.current || !tag) return;

      setState({ tag, anchor });
    }, SHOW_DELAY_MS);
  }, [fetchTag]);

  // Any scroll moves the anchor out from under the tooltip, and there is no cheap way to
  // follow it, so close instead of drifting.
  useEffect(() => {
    if (!state) return;

    window.addEventListener("scroll", hideTagTooltip, { capture: true, passive: true });
    window.addEventListener("resize", hideTagTooltip, { passive: true });

    return () => {
      window.removeEventListener("scroll", hideTagTooltip, { capture: true });
      window.removeEventListener("resize", hideTagTooltip);
    };
  }, [state, hideTagTooltip]);

  // Navigating away leaves the card describing a tag from a page that is gone, and the
  // pointer watcher would not close it until the mouse happened to move.
  useEffect(() => {
    hideTagTooltip();
  }, [pathname, hideTagTooltip]);

  useEffect(() => clearTimers, [clearTimers]);

  const value = useMemo(
    () => ({ showTagTooltip, hideTagTooltip, cancelTagTooltip }),
    [showTagTooltip, hideTagTooltip, cancelTagTooltip]
  );

  return (
    <TagTooltipContext.Provider value={value}>
      {children}
      {state ? (
        <TagTooltipCard
          tag={state.tag}
          anchor={state.anchor}
          onClose={hideTagTooltip}
        />
      ) : null}
    </TagTooltipContext.Provider>
  );
}


function TagTooltipCard({ tag, anchor, onClose }) {
  const cardRef = useRef(null);
  const [placement, setPlacement] = useState({ top: anchor.bottom + 6, left: anchor.left });

  // Closing is decided by where the pointer actually is, not by enter/leave events on the
  // anchor. The tag sits under a textarea that owns its own pointer events, and the card
  // is a sibling elsewhere in the tree, so leave-then-enter across that boundary is not
  // reliable - a grace period only made it a race.
  useEffect(() => {
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
  }, [anchor, onClose]);

  // Measured after mount, since flipping and clamping need the rendered size.
  useEffect(() => {
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
  }, [anchor, tag]);

  return (
    <div
      ref={cardRef}
      className={styles.tooltip}
      style={{ top: `${placement.top}px`, left: `${placement.left}px` }}
      role="tooltip"
    >
      <div className={styles.header}>
        {/* The canonical name, so hovering an alias searches the tag it points at. */}
        <Link
          className={classNames(styles.nameLink, getTagTypeClassName(tag.type))}
          href={`/listing?search=${encodeURIComponent(tag.name)}`}
          onClick={onClose}
        >{tag.name}</Link>
        <span className={styles.meta}>{tag.type}</span>
      </div>

      <div className={styles.meta}>
        {tag.postCount} {tag.postCount === 1 ? "post" : "posts"}
      </div>

      {tag.matchedAlias ? (
        <div className={styles.meta}>alias: {tag.matchedAlias}</div>
      ) : null}

      {tag.description ? (
        <div className={styles.description}>{tag.description}</div>
      ) : null}

      {tag.aliases?.length ? (
        <div className={styles.meta}>aka {tag.aliases.join(", ")}</div>
      ) : null}

      {tag.implications?.length ? (
        <div className={styles.meta}>implies {tag.implications.join(", ")}</div>
      ) : null}

      {/* Next calls this before navigating, so closing here does not cancel the click.
          Needed on top of the route watcher below: this link can point at the page you
          are already on, where only the query string changes. */}
      <Link
        className={styles.editLink}
        href={`/tags?name=${encodeURIComponent(tag.name)}`}
        onClick={onClose}
      >edit on tags page</Link>
    </div>
  );
}

export function useTagTooltip() {
  return useContext(TagTooltipContext) ?? NO_PROVIDER;
}
