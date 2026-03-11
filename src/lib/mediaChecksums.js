import db from "@/lib/db";

function uniqueChecksums(rawChecksums) {
  const checksums = new Set();

  for (const checksum of rawChecksums) {
    if (typeof checksum !== "string") continue;
    if (!checksum) continue;
    checksums.add(checksum);
  }

  return [...checksums];
}

export function findExistingChecksums(rawChecksums) {
  const checksums = uniqueChecksums(rawChecksums);
  if (!checksums.length) return undefined;

  const placeholders = checksums.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT *
    FROM media
    WHERE checksum IN (${placeholders})
  `).all(...checksums);

  return rows
    .filter(row => typeof row.checksum === "string" && row.checksum.length > 0)[0];
}
