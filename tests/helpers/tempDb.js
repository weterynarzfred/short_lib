import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

import applySchema from "@/lib/schema";

// Builds a throwaway SQLite file using the real schema, so tests fail when
// production DDL and test expectations drift apart.
export function createTempDb(prefix = "short-lib-test-") {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const db = new Database(path.join(tempDir, "test.db"));

  db.pragma("foreign_keys = ON");
  applySchema(db);

  return { db, tempDir };
}

export function destroyTempDb({ db, tempDir } = {}) {
  if (db) db.close();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
}
