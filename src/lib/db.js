import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const storageDir = process.env.STORAGE_DIR?.trim();
const dbRoot = storageDir ? path.resolve(storageDir) : process.cwd();
const dbPath = path.join(dbRoot, "shortlib.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    original_filename TEXT,
    notes_md TEXT,
    variants TEXT CHECK (variants IS NULL OR json_valid(variants)),
    checksum TEXT
  );
`);

db.exec(`
  DROP TRIGGER IF EXISTS media_notes_fts_ai;
  DROP TRIGGER IF EXISTS media_notes_fts_ad;
  DROP TRIGGER IF EXISTS media_notes_fts_au;
  DROP TABLE IF EXISTS media_notes_fts;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'general',
    post_count INTEGER NOT NULL DEFAULT 0
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS media_tags (
    media_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (media_id, tag_id),
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME NOT NULL
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at);
  CREATE INDEX IF NOT EXISTS idx_media_dimensions ON media(width,height);
  CREATE INDEX IF NOT EXISTS idx_media_duration ON media(duration_ms);
  CREATE INDEX IF NOT EXISTS idx_media_checksum ON media(checksum);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_media_checksum_unique ON media(checksum) WHERE checksum IS NOT NULL AND checksum <> '';
  CREATE INDEX IF NOT EXISTS idx_media_tags_media ON media_tags(media_id);
  CREATE INDEX IF NOT EXISTS idx_media_tags_tag ON media_tags(tag_id);
  CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
  CREATE INDEX IF NOT EXISTS idx_tags_post_count ON tags(post_count);
  CREATE INDEX IF NOT EXISTS idx_user_settings_updated_at ON user_settings(updated_at);
`);

export default db;
