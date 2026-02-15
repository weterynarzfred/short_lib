import Image from "next/image";

import Nav from "@/components/Nav";
import Search from "./Search";
import getPosts from "./getPosts";

import "./page.scss";

export default async function ListingPage({ searchParams }) {
  const search = (await searchParams)?.search ?? "";
  const posts = getPosts(search);

  return (
    <div className="page-listing">
      <Nav />
      <div className="content content--full">
        <h1>media listing</h1>
        <Search initialValue={search} />
        <div className="media-listing">
          {posts.map(post => (
            <div key={post.id} className="media-listing__item">
              <Image
                src={`/api/media/${post.file_path}?size=thumb`}
                width={post.variants.thumb.width}
                height={post.variants.thumb.height}
                alt=""
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
