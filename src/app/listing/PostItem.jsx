import Image from "next/image";

import styles from "./PostItem.module.scss";

export default function PostItem({ post, openLightbox }) {
  return <div className={styles.PostItem}
    onClick={() => openLightbox(post.id)}
  >
    <div className={styles.imageContainer}>
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
