import db from "@/lib/db";

export function findExistingChecksums(rawChecksums) {
  const checksums = [...new Set(rawChecksums.filter(checksum => typeof checksum === "string" && checksum))];
  if (!checksums.length) return undefined;

  const placeholders = checksums.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT id, file_path, created_at, file_size, mime_type, width, height, duration_ms,
      original_filename, notes_md, variants, checksum, score
    FROM media
    WHERE checksum IN (${placeholders})
  `).all(...checksums);

  return rows
    .filter(row => typeof row.checksum === "string" && row.checksum.length > 0)[0];
}
