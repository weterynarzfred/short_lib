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
schema has exactly one definition.

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

## Media Serving

Route: `src/app/api/media/[year]/[month]/[file]/route.js`

- Validates year/month/checksum-style filename and blocks traversal.
- Streams from:
  - `full` (original media)
  - `thumbs` when `?size=thumb`
  - `prevs` when `?size=prev`
- Supports HTTP range requests for normal files.
- For `.mkv`, remuxes to MP4 stream on demand with `ffmpeg`.

## Listing Query Flow

Primary modules, all under `src/lib/listingQuery/`:

- `parseSearch.js` -> parses query string into filters + tag expression tree
- `buildQuery.js` -> builds parameterized SQL
- `getPosts.js` -> resolves `notes:` media ids through in-memory Fuse search, then executes SQL with pagination + JSON normalization

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


