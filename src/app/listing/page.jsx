import Image from "next/image";

import buildQuery from "./buildQuery";
import parseSearch from "./parseSearch";
import Search from "./Search";
import Nav from "@/components/Nav";
import db from "@/lib/db";

import "./page.scss";

export default async function ListingPage({ searchParams }) {
  const search = (await searchParams)?.search ?? "";
  const parsed = parseSearch(search);
  const { sql, params } = buildQuery(parsed);

  const posts = db.prepare(sql).all(...params);

  return (
    <div className="page-listing">
      <Nav />
      <div className="content content--full">
        <h1>media listing</h1>
        <Search initialValue={search} />
        <div className="media-listing">
          {posts.map((post) => (
            <div key={post.id} className="media-listing__item">
              <Image src={"/api/storage/thumbs/" + post.file_path.split('/').slice(2).join('/') + ".jpg"} width="256" height="256" alt="" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
