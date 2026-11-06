import Nav from "@/components/Nav";
import ClearDeletedStoragePanel from "@/app/components/ClearDeletedStoragePanel";
import getHomeStats from "@/lib/getHomeStats";
import formatBytes from "@/lib/formatBytes";

import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

export default function Home() {
  const stats = getHomeStats();
  const statCards = [
    ["posts", stats.media.totalPosts],
    ["images", stats.media.imagePosts],
    ["videos", stats.media.videoPosts],
    ["other media", stats.media.otherPosts],
    ["db media size", formatBytes(stats.media.totalBytes)],
    ["active storage", formatBytes(stats.storage.active.bytes)],
    ["deleted bin", formatBytes(stats.storage.deleted.bytes)],
    ["active files", stats.storage.active.files],
  ];

  return (
    <>
      <Nav />
      <div className="content">
        <h1 className={styles.title}>short_lib</h1>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Library stats</h2>
          <div className={styles.panelDescription}>
            quick overview of your media collection and disk usage
          </div>

          <dl className={styles.statGrid}>
            {statCards.map(([label, value]) => (
              <div key={label} className={styles.statCard}>
                <dt className={styles.statLabel}>{label}</dt>
                <dd className={styles.statValue}>{value}</dd>
              </div>
            ))}
          </dl>

          {!stats.storage.configured && (
            <div className={styles.warning}>
              STORAGE_DIR is not configured; filesystem stats are unavailable.
            </div>
          )}
        </section>

        <ClearDeletedStoragePanel />
      </div>
    </>
  );
}
