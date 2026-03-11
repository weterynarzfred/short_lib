import Nav from "@/components/Nav";
import { getBlacklistedTags } from "@/lib/userSettings";
import BlacklistedTagsSetting from "./components/BlacklistedTagsSetting";

import styles from "./page.module.scss";

export default function SettingsPage() {
  const blacklistedTags = getBlacklistedTags();

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
      </main>
    </div>
  );
}
