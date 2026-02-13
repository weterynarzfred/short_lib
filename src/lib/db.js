import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "shortlib.db");

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    file_size INTEGER,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    checksum TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'general'
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
  CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at);
  CREATE INDEX IF NOT EXISTS idx_media_dimensions ON media(width,height);
  CREATE INDEX IF NOT EXISTS idx_media_duration ON media(duration_ms);
  CREATE INDEX IF NOT EXISTS idx_media_checksum ON media(checksum);
  CREATE INDEX IF NOT EXISTS idx_media_tags_media ON media_tags(media_id);
  CREATE INDEX IF NOT EXISTS idx_media_tags_tag ON media_tags(tag_id);
  CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
`);

export default db;
