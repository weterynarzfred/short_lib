import classNames from "classnames";
import Image from "next/image";

import styles from "./PostItem.module.scss";

function getFileExtension(post) {
  const source = String(post?.file_path || "").trim();
  const lastDot = source.lastIndexOf(".");
  if (lastDot < 0 || lastDot === source.length - 1) return "file";
  return source.slice(lastDot + 1).toLowerCase();
}

export default function PostItem({
  post,
  isSelected = false,
  isMultiSelectEnabled = false,
  onInteractPost,
}) {
  const thumb = post?.variants?.thumb;
  const fileExtension = getFileExtension(post).toUpperCase();

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
        <div className={styles.fileExtBadge}>{fileExtension}</div>
      </> : <div className={styles.fileExtFallback}>{fileExtension}</div>}
    </div>
    <div className={styles.postName}>{post.original_filename}</div>
  </div>;
}
