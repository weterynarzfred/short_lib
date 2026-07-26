// Columns added after a table already shipped. The CREATE TABLE statements below are
// `IF NOT EXISTS`, so they are a no-op on an existing database and an older copy only
// gains these through the ALTER pass. Introspection is used rather than
// `PRAGMA user_version` because some databases were altered by hand, which leaves the
// version counter untrustworthy.
//
// SQLite will not ADD COLUMN a NOT NULL column without a non-null default, and cannot
// add a PRIMARY KEY or UNIQUE column at all. Keep entries here compatible with that.
const ADDED_COLUMNS = [
  { table: "media", column: "notes_md", definition: "TEXT" },
  { table: "tags", column: "description", definition: "TEXT" },
];

// Tables no longer part of the schema. Dropped on startup so every copy of the
// database converges, including backups restored on another machine.
const RETIRED_TABLES = ["search_repair_queue"];

function createTables(db) {
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
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'general',
      post_count INTEGER NOT NULL DEFAULT 0,
      description TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_aliases (
      name TEXT PRIMARY KEY,
      tag_id INTEGER NOT NULL,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_implications (
      tag_id INTEGER NOT NULL,
      implied_tag_id INTEGER NOT NULL,
      PRIMARY KEY (tag_id, implied_tag_id),
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
      FOREIGN KEY (implied_tag_id) REFERENCES tags(id) ON DELETE CASCADE
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
}

function addMissingColumns(db) {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all();
    if (existing.some(row => row.name === column)) continue;

    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function dropRetiredTables(db) {
  for (const table of RETIRED_TABLES) db.exec(`DROP TABLE IF EXISTS ${table}`);
}

function createIndexes(db) {
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
    CREATE INDEX IF NOT EXISTS idx_tag_aliases_tag_id ON tag_aliases(tag_id);
    CREATE INDEX IF NOT EXISTS idx_tag_implications_tag_id ON tag_implications(tag_id);
    CREATE INDEX IF NOT EXISTS idx_tag_implications_implied ON tag_implications(implied_tag_id);
    CREATE INDEX IF NOT EXISTS idx_user_settings_updated_at ON user_settings(updated_at);
  `);
}

export default function applySchema(db) {
  createTables(db);
  // Columns first: an index may reference a column that only the ALTER pass adds.
  addMissingColumns(db);
  createIndexes(db);
  dropRetiredTables(db);
}
