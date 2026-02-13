import buildQuery from "@/app/listing/buildQuery";
import parseSearch from "@/app/listing/parseSearch";
import Search from "@/app/listing/Search";
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
      <div className="content">
        <h1>media listing</h1>
        <Search initialValue={search} />
        <div className="media-listing">
          {posts.map((post) => (
            <div key={post.id} className="media-listing__item">{post.file_path}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
