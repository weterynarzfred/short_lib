import Image from "next/image";

import { deletePostAction } from "@/lib/actions";

import styles from "./PostItem.module.scss";

export default function PostItem({ post, openLightbox }) {
  return <div className={styles.PostItem} >
    <div
      className={styles.imageContainer}
      onClick={() => openLightbox(post.id)}
    >
      <Image
        src={`/api/media/${post.file_path}?size=thumb`}
        width={post.variants.thumb.width}
        height={post.variants.thumb.height}
        alt=""
      />
    </div>
    <div className={styles.postName}>{post.original_filename}</div>
    <button
      className={styles.postDelete}
      onClick={async () => await deletePostAction(post.id)}
    >×</button>
  </div>;
}
