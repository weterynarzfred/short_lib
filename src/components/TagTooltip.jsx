"use client";

import { useCallback } from "react";
import Link from "next/link";
import classNames from "classnames";

import { getTagTypeClassName } from "@/lib/tagTypeOrder";
import { useTooltip } from "./TooltipProvider";

import styles from "./TooltipProvider.module.scss";

async function fetchTag(name) {
  const res = await fetch(`/api/tags/lookup?name=${encodeURIComponent(name)}`);
  if (!res.ok) return null;

  const payload = await res.json();
  return payload?.tag ?? null;
}

function TagTooltipBody({ tag, onNavigate }) {
  return (
    <div className={styles.body}>
      <div className={styles.header}>
        {/* The canonical name, so hovering an alias searches the tag it points at. */}
        <Link
          className={classNames(styles.nameLink, getTagTypeClassName(tag.type))}
          href={`/listing?search=${encodeURIComponent(tag.name)}`}
          onClick={onNavigate}
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

      <Link
        className={styles.editLink}
        href={`/tags?name=${encodeURIComponent(tag.name)}`}
        onClick={onNavigate}
      >edit on tags page</Link>
    </div>
  );
}

// The tag flavour of the shared tooltip: it owns the lookup and the card's contents, while
// the provider owns placement, timing and dismissal.
export function useTagTooltip() {
  const { showTooltip, hideTooltip, cancelTooltip } = useTooltip();

  const showTagTooltip = useCallback((name, rect) => {
    const safeName = String(name ?? "").trim();
    if (!safeName) return;

    showTooltip({
      rect,
      cacheKey: `tag:${safeName}`,
      load: async () => {
        const tag = await fetchTag(safeName);
        if (!tag) return null;

        return <TagTooltipBody tag={tag} onNavigate={hideTooltip} />;
      },
    });
  }, [showTooltip, hideTooltip]);

  return { showTagTooltip, hideTagTooltip: hideTooltip, cancelTagTooltip: cancelTooltip };
}

// Hover and focus handlers for anything rendering a tag name.
export function useTagHoverProps() {
  const { showTagTooltip, cancelTagTooltip } = useTagTooltip();

  return name => ({
    onMouseEnter: event =>
      showTagTooltip(name, event.currentTarget.getBoundingClientRect()),
    // Cancels a pending hover only; an open card closes itself once the pointer leaves
    // both it and the tag, so its links stay reachable.
    onMouseLeave: () => cancelTagTooltip(),
  });
}
