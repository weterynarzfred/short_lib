# short_lib

A personal, local, media library built around a web UI using Next.js, React, and SQLite. Supports tagging and search extended with metadata like resolution, duration, age, aspect ratio, etc - [full reference](docs/SEARCH_SYNTAX.md)

## What can you do with it

- Upload images and videos, it automatically generates thumbnails and adds basic tags.
- Search with tag logic (`AND`/`OR`/negation) plus operator filters.
- Edit tags, notes, and filenames. Tags can be edited in bulk.
- Read a file's own metadata in the panel: codec, bitrate, frame rate, bit depth, EXIF,
  and the generation parameters embedded in AI-made PNGs.
- Give tags aliases, descriptions, and implications (tagging `cat` can auto-add `animal`).
- Download a multi-selection as a zip.
- Soft-delete media into a deleted bin and clear it from the UI.
- Preview and play/slideshow the filtered list of media in fullscreen.

## Screenshots

### Upload

![Upload screen](docs/screen_upload.jpg)

### Listing

![Listing screen](docs/screen_listing.jpg)

### Search and tag suggestions

![Tag suggestions screen](docs/screen_tag_suggestions.png)

### Tag list

![Tag list screen](docs/screen_tag_list.png)

### Bulk edit

![Bulk edit screen](docs/screen_bulk_edit.png)

### Global stats

![Global stats screen](docs/screen_global_stats.png)

## Limitations

- Limited Matroska video support.
- No support for video features like multiple tracks, subtitles, etc.
- Bulk download builds the whole zip in memory, so it is only practical for small selections.
- No user accounts.

## Prerequisites

- Node.js + npm
- `ffmpeg` and `ffprobe` available on `PATH` for full video support
  - video metadata extraction on upload, and the file info panel for video and audio
    (`ffprobe`)
  - video preview frame extraction, hover preview clips, and re-encoding downloads
    (`ffmpeg`)
  - MKV streaming remux to MP4 (`ffmpeg`)
- `exiftool` on `PATH` for the file info panel on images (EXIF, ICC, PNG text chunks).
  Without it that section reports that it could not read the file; nothing else is affected.

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create your local `.env` from the example and adjust values as needed:

Example `.env`:

```env
STORAGE_DIR=H:/short_lib/storage/
THUMB_PIXELS=100000
PREVIEW_PIXELS=1000000
```
- `STORAGE_DIR`: base directory for media files and generated derivatives.
- `THUMB_PIXELS`: target total pixels for thumbnail generation.
- `PREVIEW_PIXELS`: target total pixels for preview generation. (Right now previews are not displayed anywhere yet)
- All three values above are required for the upload pipeline.

3. Start development server:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Implementation details

Search suggestions and `notes:` filtering use an in-memory Fuse.js index built from SQLite rows.

### Storage layout

`STORAGE_DIR` uses these folders:

- `full/YYYY/MM/<checksum>.<ext>` - original uploaded media
- `thumbs/YYYY/MM/<checksum>.jpg` - thumbnail derivative
- `vprevs/YYYY/MM/<checksum>.mp4` - short silent AV1 clip, played on hover for videos
- `prevs/YYYY/MM/<checksum>.jpg` - **no longer generated**; existing files are left in
  place and are safe to delete
- `tmp/` - temporary upload/transcode files
- `deleted/` - soft-deleted files (same sub-structure as above)

Deleting a post moves files into the `/deleted` folder. It can be cleared manually or using the UI.

### Backup and migration

To move or back up the full library, keep the entire `STORAGE_DIR` folder (all media + derivatives + `shortlib.db`).

When restoring on another machine/path, copy `STORAGE_DIR` and update `.env` (`STORAGE_DIR=...`) if the storage location changes.

### Architecture notes

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
