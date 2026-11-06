import Nav from "@/components/Nav";
import { getPostsPage } from "@/lib/listingQuery/getPosts";
import { MAX_RANDOM_SEED } from "@/lib/listingQuery/buildQuery";
import MediaListing from "./components/MediaListing";
import { getBlacklistedTags, getMediaSettings, getTagTypeOrderSql } from "@/lib/userSettings";

export default async function ListingPage({ searchParams }) {
  const search = (await searchParams)?.search ?? "";
  const blacklistedTags = getBlacklistedTags();
  const tagOrderSql = getTagTypeOrderSql();
  // Picked per render, so each reload of `order:random` is a new shuffle; the listing sends
  // it back with every "load more" so the pages agree with each other.
  const seed = Math.floor(Math.random() * MAX_RANDOM_SEED);
  const { posts, hasMore, nextOffset, subtitleKinds } = await getPostsPage(search, {
    defaultExcludedTags: blacklistedTags,
    tagOrderSql,
    seed,
  });
  const mediaSettings = getMediaSettings();

  return (
    <div className="page-listing">
      <Nav />
      <main className="wrapper">
        <MediaListing
          posts={posts}
          search={search}
          seed={seed}
          mediaSettings={mediaSettings}
          subtitleKinds={subtitleKinds}
          initialHasMore={hasMore}
          initialNextOffset={nextOffset}
        />
      </main>
    </div>
  );
}
