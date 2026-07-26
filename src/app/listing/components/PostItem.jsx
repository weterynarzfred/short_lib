import classNames from "classnames";
import Image from "next/image";

import getPostBadgeLabel from "../lib/postBadge";
import getPostSubtitles from "../lib/postSubtitle";

import styles from "./PostItem.module.scss";

export default function PostItem({
  post,
  subtitleKinds = [],
  isSelected = false,
  isMultiSelectEnabled = false,
  onInteractPost,
}) {
  const thumb = post?.variants?.thumb;
  const badgeLabel = getPostBadgeLabel(post);
  const subtitles = getPostSubtitles(post, subtitleKinds);

  return <div
    className={classNames(styles.card, {
      [styles.selected]: isSelected,
      [styles.selectionMode]: isMultiSelectEnabled,
    })}
    onClick={event => onInteractPost(post.id, event)}
  >
    {isMultiSelectEnabled ?
      <div className={styles.selectIndicator}>{isSelected ? "x" : ""}</div> :
      null}

    <div className={styles.imageContainer}>
      {Boolean(thumb) ? <>
        <Image
          src={`/api/media/${post.file_path}?size=thumb`}
          width={thumb.width}
          height={thumb.height}
          alt=""
        />
        <div className={styles.fileExtBadge}>{badgeLabel}</div>
      </> : <div className={styles.fileExtFallback}>{badgeLabel}</div>}
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
