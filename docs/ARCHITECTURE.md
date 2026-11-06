# Architecture notes

## Runtime Shape

- Next.js App Router, one local SQLite file `STORAGE_DIR/shortlib.db`, media on disk under
  `STORAGE_DIR`.
- `src/app/*` pages and API routes, `src/app/*/lib/*` logic private to one page,
  `src/lib/*` shared server logic, `src/lib/listingQuery/*` the search pipeline,
  `src/components/*` reusable UI.
- Two separate Fuse searches: `src/lib/search.js` matches media text (notes, filenames;
  indexes cached until an edit) and `src/lib/tagSuggestions.js` matches tag names for the
  editors.
- `src/instrumentation.js` backs the database up (`src/lib/backupDb.js`) two minutes after
  start when the newest copy in `STORAGE_DIR/backups` is three days old, keeping ten.
  **Never point a dev server at live storage** - it would back up and migrate it too.

## Data Model (SQLite)

All DDL lives in `src/lib/schema.js` as `applySchema(db)`, used by `src/lib/db.js` and by
the tests' temp databases. It runs in one `IMMEDIATE` transaction, because `next build`
migrates from several workers at once and two of them would both try to add a missing
column.

1. `createTables` - `CREATE TABLE IF NOT EXISTS`.
2. `addMissingColumns` - `ALTER TABLE ADD COLUMN` for each `ADDED_COLUMNS` entry that
   `PRAGMA table_info` shows missing. **A new column on an existing table goes in both the
   CREATE TABLE statement and this list.** `tests/schema.test.js` fails if one is forgotten.
3. `createIndexes` - after step 2, since an index may use a migrated column.
4. `dropRetiredTables` - drops `RETIRED_TABLES`.

Columns are detected by introspection, not `user_version`: some databases were altered by
hand.

- `media` - file path, created (ms), size, MIME, dimensions, duration, `original_filename`,
  `notes_md`, `variants` (JSON), `checksum`, `phash`, `score` 0-5 (0 = unrated)
- `tags` - unique `name`, `type`, `post_count` (cached), `description`
- `tag_aliases` - alias `name` -> `tag_id`, one hop; `tags.name` is always canonical
- `tag_implications` - (`tag_id`, `implied_tag_id`)
- `media_tags` - join table, cascade deletes
- `user_settings` - key/value

## Storage Paths

Every route or script that turns a stored or requested path into a file goes through
`src/lib/resolveStoragePath.js`, which returns null for anything outside the folder.

## API Routes

- `POST /api/upload` - see Upload Pipeline.
- `GET /api/listing?search=&offset=&limit=&seed=` - a page of the listing, with the default
  blacklist applied. `seed` keeps `order:random` stable across pages.
- `GET /api/tags/suggest?q=&is_edit=` - operator and tag suggestions.
- `GET /api/tags/lookup?name=` - one tag with stats, aliases and implications, for the tag
  tooltip.
- `GET /api/media/info?id=` - file metadata for the panel, read on demand.
  **ffprobe for video and audio, exiftool for stills**: exiftool reports almost nothing for
  large mp4s. Which fields appear is decided in `src/lib/mediaInfoFields.js`.
- `GET /api/media/[year]/[month]/[file]?size=thumb|vprev` - original or derivative, with
  range requests. `.mkv` is remuxed to MP4 on the fly (no range support).
- `POST /api/download/bulk` - a plain form post (`postIds` comma list) into a hidden
  iframe, so the browser saves the stream itself. Stored (not deflated) zip via `yazl`,
  with an exact `Content-Length`. Entry names come from `original_filename`, collisions
  become `name (n).ext`.
- `GET /api/download/post?id=&preset=&start=&end=&crf=&noAudio=&mode=&targetMb=` - one post,
  streamed as it encodes. Presets `original`, `jpeg`, `mp3`, `av1`. Trimming re-encodes, so
  `original` cannot be trimmed. `mode=size` is a two-pass target size; its passlog is
  UUID-named under `STORAGE_DIR/tmp` so concurrent downloads don't share statistics.

`src/lib/ffmpeg.js` wraps ffmpeg calls (stderr tail for errors, kill on client abort).

## Upload Pipeline

`src/app/api/upload/route.js`:

1. `parseUploadForm` - stream each file to `STORAGE_DIR/tmp`, hashing SHA-256.
2. Duplicate check by checksum; a duplicate returns 409 and removes the temp files.
3. `placeUploadedFiles` - move to `full/YYYY/MM/<checksum>.<ext>`, extract metadata
   (`file-type`, `sharp`, `ffprobe`).
4. `generateMediaDerivatives` - thumbnail, hover preview, perceptual hash.
5. `addMediaToDb` - rows plus `meta:image` / `meta:video` / `meta:has_audio` tags.

A failure in the preview or hash step never fails the upload; the backfill scripts fill
the gap. A failure in steps 4-5 after placing leaves an orphan file in `full/`.

### Hover previews

`src/lib/generateVideoPreview.js` writes a ~10 s silent AV1 clip: four 2.5 s segments from
the middle 90%, seeking before each `-i` so cost barely depends on length. Size comes from
the `THUMB_PIXELS` total-pixel budget (`scaleToTotalPixels`), rounded down to even, so it is
a target rather than a hard cap.

`scripts/backfill-video-previews.mjs` skips a post only when the clip exists **and** the
row records it, so a run killed between the two heals on the next run.

### Perceptual hashes (`similar:`)

`src/lib/perceptualHash.js` stores 64-bit DCT hashes in `media.phash`, 8 bytes each: one
for an image, one per **keyframe** for a video (`-skip_frame nokey`), so a short clip still
lines up with frames of its long source. Near-identical consecutive keyframes and
low-contrast frames (black, text on black) are dropped; the latter match everything.
`NULL` = not hashed yet, empty = nothing usable. `npm run backfill:similar` fills `NULL`s.

`src/lib/similarity.js` compares against every hashed post per search, no cache. Thresholds,
set by eye over every pair in the library:

- image vs image: at most 6 of 64 bits apart.
- video vs video: at least 40% of the shorter one's frames (and at least two) within 10 bits
  of a frame in the other.
- image vs multi-frame video: never - one frame against thousands only finds chance hits.

The listing selects explicit columns, never `m.*`, so hashes stay off the client.

Both modules and `resolveStoragePath` use no `@/` imports, because the backfill scripts run
them under plain node.

## Listing Query Flow

`src/lib/listingQuery/`:

- `parseSearch.js` - query string -> settings + one expression tree
- `buildQuery.js` - parameterised SQL
- `getPosts.js` - resolves in-memory terms, runs the SQL; the single entry point for the
  listing page and `/api/listing`

**Every predicate is a term in the one tree**, tags and operators alike, so all of them work
inside `AND`/`OR`/negation. `parsed.filters` holds only `orderBy`, `orderKey` and `limit`.

`notes`, `text`, `filename` and `similar` match in memory: `getPosts` writes `mediaIds` onto
each such term before the SQL is built, per term, so an empty result fails only its own
`OR` branch.

Negated comparisons are `NOT COALESCE(<comparison>, 0)`, so rows with a NULL column are
included rather than dropped.

`order:random` orders by a hash of id and a seed picked per page render, so "load more"
continues the same shuffle.

`getPosts` injects the alias resolver into `parseSearch`, so tag names reach SQL canonical.

[SEARCH_SYNTAX.md](SEARCH_SYNTAX.md) has the grammar.

## Tag System

`src/lib/addTags.js`, `src/lib/manageTag.js`, `src/lib/tagAliases.js`.

- Names are unique. Types are trimmed and lowercased **on write**, so readers take them as
  stored; typed input (`has:` values, the settings page) is still lowercased.
- Tag input is space-separated `type:name`.
- Linking and unlinking update `tags.post_count` incrementally.
- Renaming onto an existing name merges, moving links. The merged tag's aliases,
  implications and description are dropped.

**Aliases** behave as synonyms everywhere: tagging with one links the target (a type given
with it retypes the target), untagging unlinks the target, searching and blacklisting
resolve to the target, renaming onto one merges into its target. An alias can't be an
existing tag or alias name.

**Implications** are resolved transitively when tagging (recursive CTE), on the way in
only - removing `cat` later keeps `animal`.

## Server Actions

`src/lib/actions.js` holds every mutation from client components. Next redacts thrown
action errors in production, so actions return `{ ok: false, error }` instead of throwing,
and callers check `ok`. A failed action skips `revalidatePath`. The lib functions below
still throw; the conversion happens only here.

## Delete and Storage

- `src/lib/deletePost.js` moves files from `full`, `thumbs` and `vprevs` into `deleted/`,
  deletes the row and decrements tag counts.
- `src/lib/clearDeletedStorage.js` empties `deleted/`.

## Client Notes

- The open post lives in `?post=<id>`, written with `history.pushState`/`replaceState` (no
  RSC fetch). Opening pushes one entry, arrows replace it, Back or Escape closes.
- An edit or delete in the panel marks the cached listing stale; it `router.refresh()`es
  on its next mount.
- Panel keys: Up/Down prev/next (Left/Right left to a focused video for seeking), Escape
  close, `e` tags, `n` notes. `src/lib/isEditableTarget.js` makes them stand aside while
  typing. Editors save on Ctrl/Cmd+Enter.
- Below `$resTablet` the panel covers the listing; swiping the media goes prev/next.

### Tooltips

`src/components/TooltipProvider.jsx` is one `fixed` card for the whole app; callers pass
`content`, or `load` + `cacheKey`. Users: `TagTooltip`, `PostTooltip`, `useFieldHint` +
`InfoHint`.

- A card opened by focus closes on blur or Escape, not on pointer movement.
- The card is measured at the left edge before placing it: a `fixed` element with only
  `left` set shrinks to fit, so measuring it near the right edge reads a squeezed width.
- A card closes itself with `closeCard(requestId)`, not `hideTooltip`: moving straight to
  another anchor fires the old card's watcher after the new request is scheduled.

## Tests

Vitest, in `tests/`, one file per subject. DB-backed tests build their database with
`tests/helpers/tempDb.js`, which applies the real `applySchema` - prefer it to hand-written
DDL or a fake `db.prepare` matching SQL strings.
