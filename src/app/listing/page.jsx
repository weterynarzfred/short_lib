import Nav from "@/components/Nav";
import getPosts from "./lib/getPosts";
import MediaListing from "./components/MediaListing";

export default async function ListingPage({ searchParams }) {
  const search = (await searchParams)?.search ?? "";
  const posts = getPosts(search);

  return (
    <div className="page-listing">
      <Nav />
      <main className="wrapper">
        <MediaListing posts={posts} search={search} />
      </main>
    </div>
  );
}
