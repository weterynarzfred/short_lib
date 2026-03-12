import classNames from "classnames";
import Image from "next/image";

import styles from "./PostItem.module.scss";

export default function PostItem({
  post,
  isSelected = false,
  isMultiSelectEnabled = false,
  onInteractPost,
}) {
  return <div
    className={classNames(styles.card, {
      [styles.selected]: isSelected,
      [styles.selectionMode]: isMultiSelectEnabled,
    })}
    onClick={event => onInteractPost(post.id, event)}
  >
    {isMultiSelectEnabled && (
      <div className={styles.selectIndicator}>{isSelected ? "x" : ""}</div>
    )}

    <div
      className={styles.imageContainer}
    >
      <Image
        src={`/api/media/${post.file_path}?size=thumb`}
        width={post.variants.thumb.width}
        height={post.variants.thumb.height}
        alt=""
      />
    </div>
    <div className={styles.postName}>{post.original_filename}</div>
  </div>;
}
