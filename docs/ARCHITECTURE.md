# Architecture notes

## Runtime Shape

- Framework: Next.js App Router
- DB: single local SQLite file `STORAGE_DIR/shortlib.db` (falls back to project root if `STORAGE_DIR` is unset)
- Media files: filesystem under `STORAGE_DIR`
- Main sourcecode split:
  - `src/app/*` for pages and API routes
  - `src/app/*/lib/*` for logic private to a single page (client hooks, page-only queries)
  - `src/lib/*` for shared server logic
  - `src/lib/listingQuery/*` for the search pipeline, shared by the listing page and `/api/listing`
  - `src/components/*` for reusable UI parts

## Data Model (SQLite)

All DDL lives in `src/lib/schema.js` as `applySchema(db)`. `src/lib/db.js` opens the
singleton connection and applies it; tests apply the same function to a temp DB, so the
schema has exactly one definition. Path resolution sits in `src/lib/dbPath.js`, kept
side-effect free so it is testable without opening a database.

`applySchema` runs in four ordered steps, and is safe to run repeatedly:

1. `createTables` - `CREATE TABLE IF NOT EXISTS`, so a no-op on an existing database.
2. `addMissingColumns` - the migration path. Because step 1 cannot alter a table that
   already exists, a column added after release only reaches an older database from the
   `ADDED_COLUMNS` list here, applied via `ALTER TABLE ADD COLUMN` when `PRAGMA
   table_info` shows it missing. **Any new column on an existing table must be added to
   both the CREATE TABLE statement and this list.** SQLite will not add a `NOT NULL`
   column without a non-null default, nor a `PRIMARY KEY`/`UNIQUE` column at all.
3. `createIndexes` - after step 2, since an index may reference a migrated column.
4. `dropRetiredTables` - drops tables listed in `RETIRED_TABLES`, so every copy of the
   database converges, including backups restored elsewhere.

Column presence is detected by introspection rather than `PRAGMA user_version`, because
some databases were altered by hand and their version counter cannot be trusted.
`tests/schema.test.js` asserts a legacy database ends up with exactly the columns a fresh
one has, which fails if an `ADDED_COLUMNS` entry is forgotten.

- `media`
  - file path, created timestamp (ms), size, MIME, dimensions, duration
  - `original_filename`, `notes_md`, `variants` (JSON), `checksum`
- `tags`
  - unique `name`, `type`, `post_count` (cache to prevent counting on every request)
  - `description` (free text, shown on the tag list)
- `tag_aliases`
  - alternate `name` (primary key) -> `tag_id`, cascade deleted with the tag
  - one hop only: aliases point at a tag id, and `tags.name` is always canonical
- `tag_implications`
  - (`tag_id`, `implied_tag_id`) pairs, applied transitively when tagging
- `media_tags`
  - join table (`media_id`, `tag_id`) with cascade deletes
- `user_settings`
  - key/value store for UI defaults

## API Routes

- `POST /api/upload`
  - Parses multipart upload.
  - Computes SHA-256 checksum per file.
  - Rejects duplicate checksums.
  - Generates derivatives and inserts DB rows.

- `GET /api/listing?search=&offset=&limit=`
  - Returns paginated listing JSON.
  - Applies default blacklisted tags from user settings.

- `GET /api/tags/suggest?q=&is_edit=` 
  - Returns operator suggestions + in-memory Fuse-backed tag suggestions for search and tag editors.

- `GET /api/media/[year]/[month]/[file]?size=thumb|prev`
  - Streams full media or derived variants.
  - Supports HTTP range requests for non-MKV files.
  - Remuxes MKV to MP4 stream on the fly.

- `POST /api/download/bulk`
  - Takes `{ postIds: number[] }` and returns a zip of the original files.
  - Names entries from `original_filename`, de-duplicating collisions as `name (n).ext`.
  - Blocks traversal outside `STORAGE_DIR/full` and skips missing files.

## Upload Pipeline

Entry route: `src/app/api/upload/route.js`

1. Parse multipart data (`parseUploadForm`)
2. Stream each file to `STORAGE_DIR/tmp` while hashing SHA-256
3. Move to final path: `STORAGE_DIR/full/YYYY/MM/<checksum>.<ext>`
4. Extract metadata (`extractMetadata`)
   - MIME detection via `file-type`
   - image dimensions via `sharp`
   - video/audio stream info via `ffprobe`
5. Duplicate check by checksum (`findExistingChecksums`)
6. Generate derivatives (`generateMediaDerivatives`)
   - images: thumb + preview JPEG via `sharp`
   - videos: frame extraction via `ffmpeg`, then same image pipeline
7. Insert DB rows (`addMediaToDb`) and auto-add meta tags: `meta:image`, `meta:video`, `meta:has_audio` when detected.

### Hover previews

`src/lib/generateVideoPreview.js` writes a ~10 s silent AV1 clip per video, sampled as four
2.5 s segments from the middle 90% so it neither opens on a title card nor ends on credits.
Shorter videos are used whole. Seeking happens **before** each `-i`, so cost barely depends
on source length - a 47 minute 4K file takes about 2.8 s.

Size comes from a **total-pixel budget** (`THUMB_PIXELS`, the same one image thumbnails
use) via the shared `scaleToTotalPixels`, not a width cap. A width cap gave portrait video
far more pixels than landscape - a 9:16 clip came out 480x1006, nearly five times a 16:9
clip's area at the same setting. Dimensions are rounded **down** to even, which yuv420p
requires; rounding inside `scaleToTotalPixels` means the result can still land a few hundred
pixels over budget, so treat it as a target rather than a hard ceiling.

The module deliberately uses no `@/` imports: `scripts/backfill-video-previews.mjs` runs it
under plain node, which does not resolve the jsconfig alias. That script is resumable, and
writes each row's `variants` as it goes rather than batching at the end.

A post is skipped only when **both** the clip exists on disk and the row already records
it. Keying on the file alone stranded a post when a run was killed between writing the clip
and updating the row: the file was there, so every later run skipped it and the variant was
never recorded. Requiring both makes an interrupted write heal itself on the next run.

A preview failure never fails an upload; the post is usable with just a thumbnail and the
backfill can fill the gap later.

## Media Serving

Route: `src/app/api/media/[year]/[month]/[file]/route.js`

- Validates year/month/checksum-style filename and blocks traversal.
- Streams from:
  - `full` (original media)
  - `thumbs` when `?size=thumb`
  - `prevs` when `?size=prev` (legacy; no longer generated)
  - `vprevs` when `?size=vprev` - the hover preview clip
- Supports HTTP range requests for normal files.
- For `.mkv`, remuxes to MP4 stream on demand with `ffmpeg`.

## Listing Query Flow

Primary modules, all under `src/lib/listingQuery/`:

- `parseSearch.js` -> parses the query string into settings + one expression tree
- `buildQuery.js` -> builds parameterized SQL
- `getPosts.js` -> resolves `notes:` media ids through in-memory Fuse search, then executes SQL with pagination + JSON normalization

**Every predicate is a term in that one tree** - tags and operators alike - so all of them
can sit inside `AND`/`OR`/negation. `parsed.filters` holds only the settings that are not
predicates: `orderBy`, `orderKey` and `limit`. Operators used to bypass the tree and get
AND-ed in afterwards, which silently turned `fish OR notes:"fish"` into an AND.

A term is `{ type: "TERM", kind, negated, ...payload }`. `notes`, `text` and `filename`
match in memory, so `getPosts` resolves each one and writes `mediaIds` onto that term
before the SQL is built - per term, because a term may sit inside an `OR` where an empty
result should fail only its own branch.

Negated comparisons are wrapped as `NOT COALESCE(<comparison>, 0)`: a comparison against a
NULL column is NULL, and `NOT NULL` is still NULL, so a plain negation would quietly drop
rows that have no value instead of including them.

`parseSearch` and `buildQuery` are pure. `getPosts` is the only DB-aware step, and it is
the single entry point for both the listing page and `/api/listing`; it injects the alias
resolver into `parseSearch` so tag names reach SQL already canonical. A SQL failure there
is logged and rethrown rather than swallowed - values are bound and `orderBy` comes from a
whitelist, so an error means a bug, not bad user input.

[SEARCH_SYNTAX.md](SEARCH_SYNTAX.md) for full grammar.

## Tag System

Core logic: `src/lib/addTags.js`, `src/lib/manageTag.js`, `src/lib/tagAliases.js`

- Each tag has `name` and `type`. Names are unique.
- Tag input is space-separated (`type:name`), so tags with spaces are not recommended.
- To add new tags while specifying their type use `type:name`.
- Linking/unlinking updates `tags.post_count` incrementally.
- Tag rename can merge into existing target tag, moving links and deduplicating.

### Aliases

`src/lib/tagAliases.js` is the single resolver (`findTagByAliasName`, `resolveTagName`).
An alias behaves as a synonym of its target everywhere:

- Tagging with an alias links the target tag and never creates a tag of its own, so an
  alias cannot fork into a duplicate. A type given alongside an alias (`meta:felines`)
  retypes the target, exactly as `meta:cat` would.
- Untagging with an alias unlinks the target.
- Searching or blacklisting an alias resolves to the target name before SQL is built.
- Renaming a tag onto an alias merges it into what the alias points at.
- Adding an alias is rejected when the name is already a tag or another alias.

### Implications

Implications are resolved transitively when tagging (recursive CTE in `addTags.js`), so
adding `cat` with `cat -> feline -> animal` links all three. They are applied on the way
in only - removing `cat` later does not remove the implied tags.

## Server Actions

`src/lib/actions.js` is the single entry point for mutations from client components.

Next redacts thrown server-action error messages in production builds, replacing them with
an opaque digest, so the tag management actions (`updateTagAction`, `deleteTagAction`, and
the alias/implication pair) return failures as data: `{ ok: false, error }` on rejection,
`{ ok: true, ...payload }` otherwise. Callers must check `ok` instead of relying on a
rejection, and a rejected action deliberately skips `revalidatePath` so the UI keeps its
error state. `src/lib/manageTag.js` still throws - the conversion happens only at the
action boundary.

## Delete and Storage Maintenance

- Post delete (`src/lib/deletePost.js`):
  - moves matching files from `full/thumbs/prevs` into `deleted/...`
  - deletes media DB row
  - decrements linked tag post counts
- Deleted-bin cleanup (`src/lib/clearDeletedStorage.js`):
  - removes all files under `STORAGE_DIR/deleted`

## Home Stats

`src/lib/getHomeStats.js`

- DB aggregate stats (post counts and total media bytes)
- filesystem usage across `full`, `thumbs`, `prevs`, and `deleted`

## Client UX Notes

- Upload page uses XHR progress per file (`useUploadQueue`).
- Listing uses infinite loading + manual "load more" fallback.
- Media panel keyboard controls:
  - `ArrowLeft` / `ArrowRight` for prev/next
  - `Escape` to close panel
- Notes/tag editors support `Ctrl+Enter` or `Cmd+Enter` to save.

## Test Coverage

Vitest tests in `tests/` cover:

- route behavior (`/api/upload`, `/api/listing`, `/api/tags/suggest`, `/api/media`)
- search parsing and SQL building
- tag management, aliases, implications, and settings logic
- upload helpers and metadata extraction
- integration flows over temporary SQLite databases

DB-backed tests build their database with `tests/helpers/tempDb.js`, which applies the real
`applySchema`. Prefer that over hand-written `CREATE TABLE` or a fake `db.prepare` that
matches SQL strings - both drift silently as the schema and queries change.


