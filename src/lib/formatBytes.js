const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export default function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1
  );
  const scaled = bytes / (1024 ** unitIndex);
  const precision = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;

  return `${scaled.toFixed(precision)} ${BYTE_UNITS[unitIndex]}`;
}
