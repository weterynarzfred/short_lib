import Nav from "@/components/Nav";
import { getPostsPage } from "./lib/getPosts";
import MediaListing from "./components/MediaListing";
import { getMediaSettings } from "@/lib/userSettings";

export default async function ListingPage({ searchParams }) {
  const search = (await searchParams)?.search ?? "";
  const { posts, hasMore, nextOffset } = getPostsPage(search);
  const mediaSettings = getMediaSettings();

  return (
    <div className="page-listing">
      <Nav />
      <main className="wrapper">
        <MediaListing
          posts={posts}
          search={search}
          mediaSettings={mediaSettings}
          initialHasMore={hasMore}
          initialNextOffset={nextOffset}
        />
      </main>
    </div>
  );
}
