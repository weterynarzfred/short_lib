import Nav from "@/components/Nav";
import { getBlacklistedTags, getMediaSettings, getTagTypeOrder } from "@/lib/userSettings";
import BlacklistedTagsSetting from "./components/BlacklistedTagsSetting";
import MediaSettingsSetting from "./components/MediaSettingsSetting";
import TagTypeOrderSetting from "./components/TagTypeOrderSetting";

import styles from "./page.module.scss";

export default function SettingsPage() {
  const blacklistedTags = getBlacklistedTags();
  const mediaSettings = getMediaSettings();
  const tagTypeOrder = getTagTypeOrder();

  return (
    <div className="page-settings">
      <Nav />
      <main className="content">
        <h1>settings</h1>
        <p className={styles.settingsIntro}>
          defaults that affect listing behavior
        </p>

        <section className={styles.settingCard}>
          <h2 className={styles.settingTitle}>blacklisted tags</h2>
          <p className={styles.settingDescription}>
            these tags are excluded from listing by default. typing a tag
            directly in search still includes it.
          </p>

          <BlacklistedTagsSetting
            initialValue={blacklistedTags.join(" ")}
          />
        </section>

        <section className={styles.settingCard}>
          <h2 className={styles.settingTitle}>tag type order</h2>
          <p className={styles.settingDescription}>
            controls tag sorting in listing and editors. includes known types from the database.
          </p>

          <TagTypeOrderSetting
            initialValue={tagTypeOrder.join(" ")}
          />
        </section>

        <section className={styles.settingCard}>
          <h2 className={styles.settingTitle}>media behavior</h2>
          <p className={styles.settingDescription}>
            default playback toggles used in the listing media panel.
          </p>

          <MediaSettingsSetting
            initialSettings={mediaSettings}
          />
        </section>
      </main>
    </div>
  );
}
