# Video Library Advanced Features Design

## Overview

Add comprehensive advanced features to the existing video library app across three areas: smart organization, better playback, and media management. All features follow the existing zero-external-dependency, privacy-first architecture using vanilla JS frontend + Express backend + SQLite.

## Approach

Approach A: Feature-Rich Monolith. Add all features directly into the existing `server.js`, `public/app.js`, and `public/styles.css` files. New SQLite tables for tags, favorites, watch progress, trash metadata, and queue. No new dependencies, no refactoring.

---

## 1. Smart Organization

### 1.1 Tags System

**Database:**

```sql
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#667eea',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS video_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_path TEXT NOT NULL,
  tag_id INTEGER NOT NULL,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE(video_path, tag_id)
);
```

**API Endpoints:**
- `GET /api/tags` - List all tags
- `POST /api/tags` - Create tag `{name, color}`
- `DELETE /api/tags/:id` - Delete tag
- `POST /api/video/tags` - Add tag to video `{video_path, tag_id}`
- `DELETE /api/video/tags` - Remove tag from video `{video_path, tag_id}`
- `GET /api/video/tags?video_path=...` - Get tags for a video

**Frontend:**
- Tag management modal (create/delete tags with color picker)
- Tag chips displayed on video cards (small colored pills)
- Tag selector in video player header (click to add/remove tags)
- Tag filter dropdown in sidebar (multi-select, AND logic)
- Tags included in search results

### 1.2 Favorites

**Database:**

```sql
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_path TEXT NOT NULL UNIQUE,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**API Endpoints:**
- `POST /api/favorite` - Toggle favorite `{video_path}`
- `GET /api/favorites` - List all favorited paths

**Frontend:**
- Heart icon on each video card (filled = favorited, outline = not)
- Heart icon in video player header next to rating stars
- "Favorites" filter option in the rating filter dropdown
- Click to toggle, instant visual feedback

### 1.3 Sort Options

**No database changes needed.**

**Frontend:**
- Sort dropdown in the content area header: Name (A-Z), Name (Z-A), Date (newest), Date (oldest), Size (largest), Size (smallest), Rating (highest), Rating (lowest)
- Applied client-side on the `allFiles` array before rendering
- Sort preference saved to `localStorage`
- Works in both browse and search modes

### 1.4 Advanced Filters

**No database changes needed** (uses existing tables + new favorites/tags tables).

**Frontend:**
- Expand the sidebar filter section:
  - Rating filter (existing, keep as-is)
  - Seen/Unseen toggle
  - Favorites only toggle
  - Tag filter (multi-select chips)
  - File type filter (video, image, audio, document, etc.)
- Filters combine with AND logic
- Active filter count shown as badge on filter section header
- "Clear all filters" button

---

## 2. Better Playback

### 2.1 Resume Playback (Watch Progress)

**Database:**

```sql
CREATE TABLE IF NOT EXISTS watch_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_path TEXT NOT NULL UNIQUE,
  current_time REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**API Endpoints:**
- `POST /api/progress` - Save progress `{video_path, current_time, duration}`
- `GET /api/progress?video_path=...` - Get saved progress

**Frontend:**
- Auto-save progress every 5 seconds during playback via `timeupdate` event (debounced)
- On video open: fetch saved progress, if > 5 seconds and < 95% complete, show "Resume from X:XX?" toast with Resume/Start Over buttons
- Progress bar overlay on video cards (thin colored bar at bottom showing % watched)
- Clear progress when video reaches 95%+ (mark as fully watched)

### 2.2 Subtitle Support

**No database changes needed.**

**Backend:**
- `GET /api/subtitles?video_path=...` - Scan for `.srt`/`.vtt`/`.ass` files with the same base name as the video. Return list of available subtitle files with language labels (parsed from filename pattern like `video.en.srt`).
- `GET /api/subtitle/file?path=...` - Serve subtitle file content. For `.srt` files, convert to WebVTT on-the-fly (add `WEBVTT` header, convert timestamps from comma to period format).

**Frontend:**
- Subtitle toggle button in video controls
- Subtitle track selector dropdown (when multiple subtitle files exist)
- Add `<track>` elements to the `<video>` tag dynamically
- Subtitle indicator icon on video cards that have subtitle files available

### 2.3 Video Queue / Playlist

**No database changes (in-memory only).**

**Frontend:**
- Queue panel (collapsible sidebar on the right side of the video player)
- "Add to Queue" button on video cards (right-click context menu or button)
- "Play All" button in folder view to queue all videos in current folder
- Queue shows ordered list with drag-to-reorder (using native HTML5 drag-and-drop)
- Auto-advance to next video when current finishes (with 3-second countdown overlay showing next video name, click to cancel). Stops at end of queue (no loop).
- Shuffle toggle button
- Clear queue button
- Queue persists in `sessionStorage` (cleared on logout, not persisted to DB)

### 2.4 Picture-in-Picture

**No database or backend changes.**

**Frontend:**
- PiP button in video controls (next to fullscreen button)
- Uses native `video.requestPictureInPicture()` API
- Show/hide based on `document.pictureInPictureEnabled` browser support check
- When PiP is active, show "Return to player" overlay in the main player area

---

## 3. Media Management

### 3.1 Trash / Recycle Bin

**Database:**

```sql
CREATE TABLE IF NOT EXISTS trash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_path TEXT NOT NULL,
  trash_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size INTEGER,
  deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Backend:**
- Modify `DELETE /api/video` to move files to `{videoDirectory}/.trash/` instead of permanent deletion. Store original path in `trash` table.
- `GET /api/trash` - List trashed files
- `POST /api/trash/restore` - Restore file `{id}` back to original location
- `DELETE /api/trash/:id` - Permanently delete from trash
- `POST /api/trash/empty` - Empty entire trash (POST to avoid route collision with `:id`)
- Auto-purge: on server start, delete trash items older than 30 days (configurable in config.json as `trashRetentionDays`)

**Frontend:**
- Trash icon in header that opens trash view modal
- Trash badge showing count of items in trash
- Trash view: list of deleted files with original path, deletion date, size
- Per-item Restore and Permanent Delete buttons
- "Empty Trash" button with confirmation
- "Undo" toast shown for 5 seconds after deletion with quick restore

**Config:**
- `trashRetentionDays` (default: 30) in config.json

### 3.2 Batch Operations

**Backend:**
- `POST /api/video/move` - Move files `{paths: [...], destination: "folder/path"}`
- `POST /api/video/batch-tag` - Add tag to multiple files `{paths: [...], tag_id}`
- `POST /api/video/batch-rate` - Rate multiple files `{paths: [...], rating}`
- `POST /api/video/batch-favorite` - Toggle favorite on multiple files `{paths: [...]}`

**Frontend:**
- Extend existing selection mode with new action buttons:
  - Move To (opens folder picker modal)
  - Tag (opens tag selector)
  - Rate (opens rating selector)
  - Favorite (toggle all selected)
- Folder picker modal: tree view of directories for move destination
- "Select All" / "Deselect All" buttons in selection mode
- Selection count in header

### 3.3 Disk Usage Stats

**No database changes needed.**

**Backend:**
- `GET /api/stats` - Return:
  - Total file count and size
  - Breakdown by file type (video, image, audio, etc.) with count and total size
  - Top 10 largest files
  - Top 10 largest folders
  - Format breakdown (count per extension)
  - Trash size

**Frontend:**
- Stats button in header (chart icon)
- Stats modal/dashboard:
  - Summary cards: total files, total size, trash size
  - File type breakdown as horizontal bar chart (CSS-only, no chart library)
  - Top folders by size list
  - Top files by size list
  - Format distribution list

### 3.4 Duplicate Detection

**No database changes needed.**

**Backend:**
- `GET /api/duplicates` - Scan all files and return groups of potential duplicates. Detection criteria:
  - Same file name (different folders)
  - Same file size AND same extension (heuristic - presented for user review, not auto-deleted)
  - Returns grouped results: `[{group: [{name, path, size, modified}]}]`
  - Groups with only 1 file are excluded from results

**Frontend:**
- "Find Duplicates" button in the stats modal
- Duplicate results view: grouped cards showing duplicate sets
- Each group shows all copies with path, size, and date
- Per-file delete button and "Keep newest" / "Keep oldest" quick actions per group

---

## Database Migration Strategy

All new tables use `CREATE TABLE IF NOT EXISTS`, so they are additive and won't break existing installations. The existing `initializeDatabase()` function in server.js is extended with the new table creation statements.

## Config Changes

Add to `config.json`:
```json
{
  "trashRetentionDays": 30
}
```

No other config changes needed. All features work with defaults.

## Files Modified

1. `server.js` - New API endpoints, new DB tables, modified delete endpoint for trash
2. `public/app.js` - All new frontend features, UI interactions, state management
3. `public/styles.css` - Styles for new UI components (tags, queue panel, stats, trash view, etc.)
4. `public/index.html` - New modals (tags, stats, trash, queue, folder picker), new header buttons, subtitle tracks

## Privacy Guarantees Preserved

- All data stays local (SQLite + filesystem)
- No new external dependencies
- No network requests outside localhost
- Subtitles loaded from local filesystem only
- Queue/playlist is session-only (sessionStorage)
- Stats computed locally from filesystem scan
