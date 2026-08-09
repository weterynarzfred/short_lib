import Nav from "@/components/Nav";
import {
  getBlacklistedTags,
  getDescribePrompt,
  getMediaSettings,
  getTagTypeColors,
  getTagTypeOrder,
} from "@/lib/userSettings";
import BlacklistedTagsSetting from "./components/BlacklistedTagsSetting";
import DescribePromptSetting from "./components/DescribePromptSetting";
import MediaSettingsSetting from "./components/MediaSettingsSetting";
import TagTypeOrderSetting from "./components/TagTypeOrderSetting";

import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const blacklistedTags = getBlacklistedTags();
  const mediaSettings = getMediaSettings();
  const tagTypeOrder = getTagTypeOrder();
  const tagTypeColors = getTagTypeColors();
  const describePrompt = getDescribePrompt();

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

          <MediaSettingsSetting
            initialSettings={mediaSettings}
          />
        </section>
        <section className={styles.settingCard}>
          <h2 className={styles.settingTitle}>describe prompt</h2>
          <p className={styles.settingDescription}>
            sent with the image when you press describe in the media panel. the result is
            appended to the notes as a draft, so it is searchable once you save it. clear
            the field and save to go back to the default.
          </p>

          <DescribePromptSetting initialValue={describePrompt} />
        </section>
      </main>
    </div>
  );
}
