// Kept off the startup path: the app is woken on demand and has to reach interactive UI
// first. The service manager keeps it running for 15 idle minutes, so a backup scheduled a
// couple of minutes in still runs on every wake.
const BACKUP_DELAY_MS = 2 * 60 * 1000;

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    setTimeout(async () => {
      try {
        const { default: backupDbIfDue } = await import("@/lib/backupDb");
        const file = await backupDbIfDue();
        if (file) console.log("Database backed up to", file);
      } catch (error) {
        console.error("Database backup failed", error);
      }
    }, BACKUP_DELAY_MS);
  }
}
