"use client";

import { useState } from "react";
import classNames from "classnames";
import Image from "next/image";

import getPostBadgeLabel from "../lib/postBadge";
import getPostSubtitles from "../lib/postSubtitle";
import { usePostTooltip } from "./PostTooltip";

import styles from "./PostItem.module.scss";

export default function PostItem({
  post,
  subtitleKinds = [],
  isSelected = false,
  isMultiSelectEnabled = false,
  onInteractPost,
}) {
  const thumb = post?.variants?.thumb;
  const videoPreview = post?.variants?.videoPreview;
  const badgeLabel = getPostBadgeLabel(post);
  const subtitles = getPostSubtitles(post, subtitleKinds);

  // Mounted only while hovered, so a grid of 100 cards is not 100 decoding videos. The
  // thumbnail stays underneath, which keeps the card's height stable during the swap.
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Both the preview and the tooltip hang off the same hover, so the handlers are merged
  // rather than one overwriting the other.
  const { getHoverProps, hidePostTooltip } = usePostTooltip();
  const tooltipHoverProps = getHoverProps(post, subtitleKinds);

  return <div
    className={classNames(styles.card, {
      [styles.selected]: isSelected,
      [styles.selectionMode]: isMultiSelectEnabled,
    })}
    onClick={event => {
      // The panel opens over the same area the card sits in, so a lingering tooltip would
      // end up floating on top of it.
      hidePostTooltip();
      onInteractPost(post.id, event);
    }}
    onMouseEnter={event => {
      if (videoPreview) setIsPreviewing(true);
      tooltipHoverProps.onMouseEnter(event);
    }}
    onMouseLeave={() => {
      if (videoPreview) setIsPreviewing(false);
      tooltipHoverProps.onMouseLeave();
    }}
  >
    {isMultiSelectEnabled ?
      <div className={styles.selectIndicator}>{isSelected ? "x" : ""}</div> :
      null}

    <div className={styles.imageContainer}>
      {thumb ? (
        <Image
          src={`/api/media/${post.file_path}?size=thumb`}
          width={thumb.width}
          height={thumb.height}
          alt=""
        />
      ) : (
        // Without a thumbnail there is nothing else to recognise the post by, so the
        // filename takes the space the image would have occupied.
        <div className={styles.thumbFallbackName}>{post.original_filename}</div>
      )}

      {isPreviewing && videoPreview ? (
        <video
          className={styles.hoverPreview}
          src={`/api/media/${post.file_path}?size=vprev`}
          autoPlay
          loop
          muted
          playsInline
          // Pointer events would land on the video instead of the card, breaking clicks.
          style={{ pointerEvents: "none" }}
        />
      ) : null}

      <div className={styles.fileExtBadge}>{badgeLabel}</div>
    </div>
    {subtitles.map(({ kind, text }) => (
      <div key={kind} className={styles.postSubtitle}>{text}</div>
    ))}

    {/* Last, because it is the only variable-height line - keeping it below leaves the
        single-line values aligned across cards. */}
    {post.match ? <div className={styles.postSnippet}>
      {post.match.truncatedStart ? "…" : null}
      {post.match.segments.map((segment, index) => segment.isMatch
        ? <mark key={index}>{segment.text}</mark>
        : <span key={index}>{segment.text}</span>)}
      {post.match.truncatedEnd ? "…" : null}
    </div> : null}
  </div>;
}
