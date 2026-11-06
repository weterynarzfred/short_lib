import path from "path";

// No "@/" imports: the backfill scripts load this under plain node.

// The absolute path of a file inside one of the storage folders ("full", "thumbs",
// "vprevs"), or null when the pieces would land outside that folder or on the folder
// itself. The pieces come from the database or the URL, so this is the check that keeps a
// crafted path from reading anything else on disk. STORAGE_DIR is read per call, so tests
// can point it somewhere else.
export default function resolveStoragePath(folder, ...segments) {
  const base = path.resolve(process.env.STORAGE_DIR, folder);
  const filePath = path.resolve(base, ...segments);
  const relative = path.relative(base, filePath);

  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    return null;

  return filePath;
}
