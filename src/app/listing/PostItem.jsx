import Image from "next/image";

import "./PostItem.scss";

export default function PostItem({ post, openLightbox }) {
  return <div className="PostItem"
    onClick={() => openLightbox(post.id)}
  >
    <Image
      src={`/api/media/${post.file_path}?size=thumb`}
      width={post.variants.thumb.width}
      height={post.variants.thumb.height}
      alt=""
    />
  </div>;
}
