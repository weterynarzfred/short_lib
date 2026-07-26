import path from "path";

// Kept free of side effects so it can be tested without constructing a database.
export default function resolveDbPath(storageDir = process.env.STORAGE_DIR) {
  const trimmed = storageDir?.trim();
  const dbRoot = trimmed ? path.resolve(trimmed) : process.cwd();

  return path.join(dbRoot, "shortlib.db");
}
