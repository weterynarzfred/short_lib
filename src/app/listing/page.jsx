import Nav from "@/components/Nav";
import Search from "./Search";
import getPosts from "./getPosts";
import MediaListing from "./MediaListing";

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
        <MediaListing posts={posts} />
      </div>
    </div>
  );
}
