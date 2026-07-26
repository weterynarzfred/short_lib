import classNames from "classnames";
import Image from "next/image";

import getPostBadgeLabel from "../lib/postBadge";

import styles from "./PostItem.module.scss";

export default function PostItem({
  post,
  isSelected = false,
  isMultiSelectEnabled = false,
  onInteractPost,
}) {
  const thumb = post?.variants?.thumb;
  const badgeLabel = getPostBadgeLabel(post);

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
    <div className={styles.postName}>{post.original_filename}</div>
  </div>;
}
