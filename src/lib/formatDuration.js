export default function formatDuration(durationMs) {
  const ms = Number(durationMs);
  if (!Number.isFinite(ms) || ms <= 0) return "";

  const totalSeconds = Math.round(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const paddedSeconds = String(seconds).padStart(2, "0");
  if (!hours) return `${minutes}:${paddedSeconds}`;

  return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
}
