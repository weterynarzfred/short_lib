"use client";

import { useCallback } from "react";
import Link from "next/link";
import classNames from "classnames";

import { getTagTypeClassName } from "@/lib/tagTypeOrder";
import { useTooltip } from "@/components/TooltipProvider";

import { clipNotes, getMetaParts } from "../lib/postTooltipDetails";

import styles from "./PostTooltip.module.scss";

// Longer than the usual hover delay. Video cards already answer a hover by playing their
// preview, so a card that appeared at the same moment would fight it; at this delay the
// preview is what a passing hover gets, and the tags are what lingering on one gets.
const POST_TOOLTIP_DELAY_MS = 650;

// A handful of posts carry very long tag lists, and a card taller than the viewport cannot
// be placed anywhere sensible.
const TAG_CLIP_COUNT = 40;

function PostTooltipBody({ post, subtitleKinds, onNavigate }) {
  const metaParts = getMetaParts(post, subtitleKinds);
  const notes = clipNotes(post.notes_md);
  const hiddenTagCount = Math.max(post.tags.length - TAG_CLIP_COUNT, 0);

  return (
    <div className={styles.body}>
      {post.tags.length ? (
        <div className={styles.tags}>
          {post.tags.slice(0, TAG_CLIP_COUNT).map(tag => (
            <Link
              key={tag.id}
              className={classNames(styles.tag, getTagTypeClassName(tag.type))}
              href={`/listing?search=${encodeURIComponent(tag.name)}`}
              onClick={onNavigate}
            >{tag.name}</Link>
          ))}
          {hiddenTagCount ? (
            <span className={styles.muted}>+{hiddenTagCount} more</span>
          ) : null}
        </div>
      ) : (
        <div className={styles.muted}>no tags</div>
      )}

      {metaParts.length ? (
        <div className={styles.meta}>{metaParts.join(" · ")}</div>
      ) : null}

      {notes ? <div className={styles.notes}>{notes}</div> : null}
    </div>
  );
}

// Hover handlers for a post card. The content is synchronous - the listing row already
// carries everything shown here - so there is nothing to fetch and no cache key to
// invalidate when the post is edited in the panel.
export function usePostTooltip() {
  const { showTooltip, hideTooltip, cancelTooltip } = useTooltip();

  const getHoverProps = useCallback((post, subtitleKinds) => ({
    onMouseEnter: event => showTooltip({
      rect: event.currentTarget.getBoundingClientRect(),
      content: (
        <PostTooltipBody
          post={post}
          subtitleKinds={subtitleKinds}
          onNavigate={hideTooltip}
        />
      ),
      delay: POST_TOOLTIP_DELAY_MS,
    }),
    // Cancels a pending hover only; an open card closes itself once the pointer has left
    // both it and the post, which is what keeps its links reachable.
    onMouseLeave: () => cancelTooltip(),
  }), [showTooltip, hideTooltip, cancelTooltip]);

  return { getHoverProps, hidePostTooltip: hideTooltip };
}
