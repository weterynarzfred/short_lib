# Architecture notes

## Runtime Shape

- Framework: Next.js App Router
- DB: single local SQLite file `shortlib.db`
- Media files: filesystem under `STORAGE_DIR`
- Main sourcecode split:
  - `src/app/*` for pages and API routes
  - `src/lib/*` for shared server logic
  - `src/components/*` for reusable UI parts

## Data Model (SQLite)

Initialized in `src/lib/db.js`:

- `media`
  - file path, created timestamp (ms), size, MIME, dimensions, duration
  - `original_filename`, `notes_md`, `variants` (JSON), `checksum`
- `tags`
  - unique `name`, `type`, `post_count` (cache to prevent counting on every request)
- `media_tags`
  - join table (`media_id`, `tag_id`) with cascade deletes
- `user_settings`
  - key/value store for UI defaults
- `media_notes_fts`
  - FTS5 virtual table tied to `media.notes_md`
  - triggers keep FTS index synced on insert/update/delete

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
  - Returns tag/operator suggestions for search and tag editors.

- `GET /api/media/[year]/[month]/[file]?size=thumb|prev`
  - Streams full media or derived variants.
  - Supports HTTP range requests for non-MKV files.
  - Remuxes MKV to MP4 stream on the fly.

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

Primary modules:

- `parseSearch.js` -> parses query string into filters + tag expression tree
- `buildQuery.js` -> builds parameterized SQL
- `getPosts.js` -> executes query with pagination + JSON normalization

[SEARCH_SYNTAX.md](SEARCH_SYNTAX.md) for full grammar.

## Tag System

Core logic: `src/lib/addTags.js`, `src/lib/manageTag.js`

- Each tag has `name` and `type`. Names are unique.
- Tag input is space-separated (`type:name`), so tags with spaces are not recommended.
- To add new tags while specifying their type use `type:name`.
- Linking/unlinking updates `tags.post_count` incrementally.
- Tag rename can merge into existing target tag, moving links and deduplicating.

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
- tag management and settings logic
- upload helpers and metadata extraction
- integration flows over temporary SQLite databases
