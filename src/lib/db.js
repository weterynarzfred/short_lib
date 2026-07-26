import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import applySchema from "@/lib/schema";

const storageDir = process.env.STORAGE_DIR?.trim();
const dbRoot = storageDir ? path.resolve(storageDir) : process.cwd();
const dbPath = path.join(dbRoot, "shortlib.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");
applySchema(db);

export default db;
