import Image from "next/image";

import styles from "./PostItem.module.scss";

export default function PostItem({ post, openMediaPanel }) {
  return <div className={styles.PostItem} >
    <div
      className={styles.imageContainer}
      onClick={() => openMediaPanel(post.id)}
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
