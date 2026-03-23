import Nav from "@/components/Nav";
import { getPostsPage } from "./lib/getPosts";
import MediaListing from "./components/MediaListing";
import { getBlacklistedTags, getMediaSettings, getTagTypeOrderSql } from "@/lib/userSettings";

export default async function ListingPage({ searchParams }) {
  const search = (await searchParams)?.search ?? "";
  const blacklistedTags = getBlacklistedTags();
  const tagOrderSql = getTagTypeOrderSql();
  const { posts, hasMore, nextOffset } = await getPostsPage(search, {
    defaultExcludedTags: blacklistedTags,
    tagOrderSql,
  });
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
