import Nav from "@/components/Nav";
import ClearDeletedStoragePanel from "@/app/components/ClearDeletedStoragePanel";
import getHomeStats from "@/lib/getHomeStats";
import formatBytes from "@/lib/formatBytes";

import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

export default function Home() {
  const stats = getHomeStats();

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
            <div className={styles.statCard}>
              <dt className={styles.statLabel}>posts</dt>
              <dd className={styles.statValue}>{stats.media.totalPosts}</dd>
            </div>

            <div className={styles.statCard}>
              <dt className={styles.statLabel}>images</dt>
              <dd className={styles.statValue}>{stats.media.imagePosts}</dd>
            </div>

            <div className={styles.statCard}>
              <dt className={styles.statLabel}>videos</dt>
              <dd className={styles.statValue}>{stats.media.videoPosts}</dd>
            </div>

            <div className={styles.statCard}>
              <dt className={styles.statLabel}>other media</dt>
              <dd className={styles.statValue}>{stats.media.otherPosts}</dd>
            </div>

            <div className={styles.statCard}>
              <dt className={styles.statLabel}>db media size</dt>
              <dd className={styles.statValue}>{formatBytes(stats.media.totalBytes)}</dd>
            </div>

            <div className={styles.statCard}>
              <dt className={styles.statLabel}>active storage</dt>
              <dd className={styles.statValue}>{formatBytes(stats.storage.active.bytes)}</dd>
            </div>

            <div className={styles.statCard}>
              <dt className={styles.statLabel}>deleted bin</dt>
              <dd className={styles.statValue}>{formatBytes(stats.storage.deleted.bytes)}</dd>
            </div>

            <div className={styles.statCard}>
              <dt className={styles.statLabel}>active files</dt>
              <dd className={styles.statValue}>{stats.storage.active.files}</dd>
            </div>
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
