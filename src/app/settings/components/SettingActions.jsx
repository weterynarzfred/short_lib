import styles from "../page.module.scss";

export default function SettingActions({ isDirty, isPending, onSave, onReset, status, error }) {
  return (
    <div className={styles.settingActions}>
      <button
        type="button"
        className={styles.settingButton}
        disabled={!isDirty || isPending}
        onClick={onSave}
      >{isPending ? "saving..." : "save"}</button>

      <button
        type="button"
        className={styles.settingButton}
        disabled={!isDirty || isPending}
        onClick={onReset}
      >reset</button>

      {status && <div className={styles.statusOk}>{status}</div>}
      {error && <div className={styles.statusError}>{error}</div>}
    </div>
  );
}
