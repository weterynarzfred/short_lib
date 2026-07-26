import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import resolveDbPath from "@/lib/dbPath";
import applySchema from "@/lib/schema";

const dbPath = resolveDbPath();

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");
applySchema(db);

export default db;
