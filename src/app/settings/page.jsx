import Nav from "@/components/Nav";
import {
  getBlacklist,
  getMediaSettings,
  getTagTypeColors,
  getTagTypeOrder,
} from "@/lib/userSettings";
import BlacklistSetting from "./components/BlacklistSetting";
import MediaSettingsSetting from "./components/MediaSettingsSetting";
import TagTypeOrderSetting from "./components/TagTypeOrderSetting";

import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const blacklist = getBlacklist();
  const mediaSettings = getMediaSettings();
  const tagTypeOrder = getTagTypeOrder();
  const tagTypeColors = getTagTypeColors();

  return (
    <>
      <Nav />
      <main className="content">
        <h1>settings</h1>
        <p className={styles.settingsIntro}>
          defaults that affect listing behavior
        </p>

        <section className={styles.settingCard}>
          <h2 className={styles.settingTitle}>blacklist</h2>
          <p className={styles.settingDescription}>
            tags or search terms (like has:parent) excluded from listing by
            default. mentioning one in search still includes it.
          </p>

          <BlacklistSetting initialValue={blacklist.join(" ")} />
        </section>

        <section className={styles.settingCard}>
          <h2 className={styles.settingTitle}>tag type order</h2>
          <p className={styles.settingDescription}>
            reorder tag types and set display colors used across the app.
          </p>

          <TagTypeOrderSetting
            initialValue={tagTypeOrder.join(" ")}
            initialColors={tagTypeColors}
          />
        </section>

        <section className={styles.settingCard}>
          <h2 className={styles.settingTitle}>media behavior</h2>
          <p className={styles.settingDescription}>
            default playback toggles used in the listing media panel.
          </p>

          <MediaSettingsSetting initialSettings={mediaSettings} />
        </section>
      </main>
    </>
  );
}
