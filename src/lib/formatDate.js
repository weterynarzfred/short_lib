// Local date rather than UTC, so it matches the day the user remembers, and ISO ordering
// rather than a locale format, so it reads the same on every machine.
export default function formatDate(createdAt) {
  const ms = Number(createdAt);
  if (!Number.isFinite(ms) || ms <= 0) return "";

  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}
