# Video Library Advanced Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tags, favorites, sort, advanced filters, resume playback, subtitles, video queue, picture-in-picture, trash bin, batch operations, disk usage stats, and duplicate detection to the existing video library app.

**Architecture:** All features are added directly into the existing monolith files (`server.js`, `public/app.js`, `public/styles.css`, `public/index.html`). New SQLite tables created via `CREATE TABLE IF NOT EXISTS` in the existing `initializeDatabase()`. No new npm dependencies. Privacy-first, zero external requests.

**Tech Stack:** Node.js/Express, vanilla JavaScript, SQLite (better-sqlite3), HTML5/CSS3

## Global Constraints

- Zero external dependencies beyond existing `express`, `express-session`, `better-sqlite3`
- All data stays local: SQLite DB at `{videoDirectory}/videolibrary.db`, files on local filesystem
- No external network requests (CSP headers + fetch/XHR interceptor enforced)
- All new API endpoints use `requireAuth` middleware
- All user-supplied paths go through existing `sanitizePath()` function
- All HTML output uses existing `escapeHtml()` function for XSS prevention
- No test framework exists in this project; testing is manual via browser

---

## File Structure

All changes go into the 4 existing files:

| File | Responsibility |
|------|---------------|
| `server.js` | New DB tables in `initializeDatabase()`, new API endpoints, modified `DELETE /api/video` for trash, modified `readDirectoryRecursive()` and `searchVideosRecursive()` to include favorites/tags/progress data |
| `public/index.html` | New header buttons (stats, trash, tags), new modals (tags manager, stats dashboard, trash view, folder picker, queue panel), new filter controls in sidebar, new player controls (PiP, subtitles, favorite, tags) |
| `public/app.js` | New state variables, new DOM element refs, new event listeners in `init()`, new functions for each feature, modified `displayVideos()` for tags/favorites/progress overlays, modified `playVideo()` for resume/subtitles/queue |
| `public/styles.css` | Styles for all new UI components: tag chips, favorite hearts, progress bars, queue panel, stats dashboard, trash view, filter section, toast notifications, folder picker tree |

---

### Task 1: Database Schema & Trash Setup

**Files:**
- Modify: `server.js:14-18` (trash directory setup alongside thumbnails)
- Modify: `server.js:42-82` (`initializeDatabase()` - add new tables)
- Modify: `config.json.example` (add `trashRetentionDays`)

**Interfaces:**
- Produces: New SQLite tables `tags`, `video_tags`, `favorites`, `watch_progress`, `trash`. New `.trash` directory in videoDirectory. All later tasks depend on these tables existing.

- [ ] **Step 1: Add trash directory setup after thumbnails setup in server.js**

After line 18 in `server.js`, add:

```javascript
// Setup trash directory
const trashDir = path.join(config.videoDirectory, '.trash');
if (!fs.existsSync(trashDir)) {
  fs.mkdirSync(trashDir, { recursive: true });
}
```

- [ ] **Step 2: Add new tables to `initializeDatabase()` in server.js**

Inside the `db.exec()` template literal in `initializeDatabase()`, after the existing `CREATE INDEX` statements (after line 78), add:

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

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_path TEXT NOT NULL UNIQUE,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS watch_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_path TEXT NOT NULL UNIQUE,
      current_time REAL NOT NULL DEFAULT 0,
      duration REAL NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS trash (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_path TEXT NOT NULL,
      trash_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size INTEGER,
      deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_video_tags_video_path ON video_tags(video_path);
    CREATE INDEX IF NOT EXISTS idx_video_tags_tag_id ON video_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_favorites_video_path ON favorites(video_path);
    CREATE INDEX IF NOT EXISTS idx_watch_progress_video_path ON watch_progress(video_path);
    CREATE INDEX IF NOT EXISTS idx_trash_original_path ON trash(original_path);
```

- [ ] **Step 3: Add auto-purge for old trash items after `initializeDatabase()` call**

After line 84 (`initializeDatabase();`), add:

```javascript
// Auto-purge old trash items
(function purgeOldTrash() {
  const retentionDays = config.trashRetentionDays || 30;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const oldItems = db.prepare('SELECT id, trash_path FROM trash WHERE deleted_at < ?').all(cutoff);
  for (const item of oldItems) {
    try {
      const fullTrashPath = path.join(trashDir, item.trash_path);
      if (fs.existsSync(fullTrashPath)) {
        fs.unlinkSync(fullTrashPath);
      }
      db.prepare('DELETE FROM trash WHERE id = ?').run(item.id);
    } catch (e) {
      console.warn(`Failed to purge trash item ${item.id}:`, e.message);
    }
  }
  if (oldItems.length > 0) {
    console.log(`Purged ${oldItems.length} old trash items (>${retentionDays} days)`);
  }
})();
```

- [ ] **Step 4: Add `trashRetentionDays` to config.json.example**

Add `"trashRetentionDays": 30` to `config.json.example` after the `"allowedImageExtensions"` array.

- [ ] **Step 5: Test manually**

Start the server with `node server.js`. Check the console output shows "Database initialized" without errors. Verify a `.trash` directory was created inside the video directory. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add server.js config.json.example
git commit -m "feat: add database schema for tags, favorites, progress, trash"
```

---

### Task 2: Tags API Endpoints

**Files:**
- Modify: `server.js` (add endpoints after the existing album endpoints, around line 1055)

**Interfaces:**
- Consumes: `tags` and `video_tags` tables from Task 1, `requireAuth` middleware, `sanitizePath()` function
- Produces: `GET /api/tags`, `POST /api/tags`, `DELETE /api/tags/:id`, `GET /api/video/tags`, `POST /api/video/tags`, `DELETE /api/video/tags`

- [ ] **Step 1: Add tags CRUD endpoints to server.js**

After the album endpoints (after the `app.delete('/api/albums/:id/videos', ...)` handler around line 1055), add:

```javascript
// ===== TAGS API =====

// Get all tags
app.get('/api/tags', requireAuth, (req, res) => {
  try {
    const tags = db.prepare('SELECT * FROM tags ORDER BY name').all();
    res.json({ tags });
  } catch (error) {
    console.error('Get tags error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create a tag
app.post('/api/tags', requireAuth, (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Tag name required' });
    }
    const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)')
      .run(name.trim(), color || '#667eea');
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, tag });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Tag name already exists' });
    }
    console.error('Create tag error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Delete a tag
app.delete('/api/tags/:id', requireAuth, (req, res) => {
  try {
    const tagId = parseInt(req.params.id);
    db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete tag error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get tags for a video
app.get('/api/video/tags', requireAuth, (req, res) => {
  try {
    const { video_path } = req.query;
    if (!video_path) {
      return res.status(400).json({ error: 'video_path parameter required' });
    }
    const tags = db.prepare(`
      SELECT t.* FROM tags t
      JOIN video_tags vt ON t.id = vt.tag_id
      WHERE vt.video_path = ?
      ORDER BY t.name
    `).all(video_path);
    res.json({ tags });
  } catch (error) {
    console.error('Get video tags error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Add tag to a video
app.post('/api/video/tags', requireAuth, (req, res) => {
  try {
    const { video_path, tag_id } = req.body;
    if (!video_path || !tag_id) {
      return res.status(400).json({ error: 'video_path and tag_id required' });
    }
    db.prepare('INSERT OR IGNORE INTO video_tags (video_path, tag_id) VALUES (?, ?)')
      .run(video_path, tag_id);
    res.json({ success: true });
  } catch (error) {
    console.error('Add video tag error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Remove tag from a video
app.delete('/api/video/tags', requireAuth, (req, res) => {
  try {
    const { video_path, tag_id } = req.body;
    if (!video_path || !tag_id) {
      return res.status(400).json({ error: 'video_path and tag_id required' });
    }
    db.prepare('DELETE FROM video_tags WHERE video_path = ? AND tag_id = ?')
      .run(video_path, tag_id);
    res.json({ success: true });
  } catch (error) {
    console.error('Remove video tag error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 2: Test manually**

Start the server, log in, open browser DevTools Console. Run:
```javascript
// Create a tag
await fetch('/api/tags', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'Action', color:'#ff6b6b'})}).then(r=>r.json())
// List tags
await fetch('/api/tags').then(r=>r.json())
```
Verify tag is created and listed.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add tags CRUD API endpoints"
```

---

### Task 3: Favorites & Watch Progress API Endpoints

**Files:**
- Modify: `server.js` (add endpoints after tags endpoints)

**Interfaces:**
- Consumes: `favorites` and `watch_progress` tables from Task 1, `requireAuth` middleware
- Produces: `POST /api/favorite`, `GET /api/favorites`, `POST /api/progress`, `GET /api/progress`

- [ ] **Step 1: Add favorites endpoints to server.js**

After the tags endpoints added in Task 2, add:

```javascript
// ===== FAVORITES API =====

// Toggle favorite
app.post('/api/favorite', requireAuth, (req, res) => {
  try {
    const { video_path } = req.body;
    if (!video_path) {
      return res.status(400).json({ error: 'video_path required' });
    }
    const existing = db.prepare('SELECT id FROM favorites WHERE video_path = ?').get(video_path);
    if (existing) {
      db.prepare('DELETE FROM favorites WHERE video_path = ?').run(video_path);
      res.json({ success: true, favorited: false });
    } else {
      db.prepare('INSERT INTO favorites (video_path) VALUES (?)').run(video_path);
      res.json({ success: true, favorited: true });
    }
  } catch (error) {
    console.error('Favorite toggle error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get all favorites
app.get('/api/favorites', requireAuth, (req, res) => {
  try {
    const favorites = db.prepare('SELECT video_path FROM favorites').all();
    res.json({ favorites: favorites.map(f => f.video_path) });
  } catch (error) {
    console.error('Get favorites error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 2: Add watch progress endpoints to server.js**

Immediately after the favorites endpoints, add:

```javascript
// ===== WATCH PROGRESS API =====

// Save watch progress
app.post('/api/progress', requireAuth, (req, res) => {
  try {
    const { video_path, current_time, duration } = req.body;
    if (!video_path || current_time === undefined || !duration) {
      return res.status(400).json({ error: 'video_path, current_time, and duration required' });
    }
    db.prepare(`
      INSERT INTO watch_progress (video_path, current_time, duration, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(video_path) DO UPDATE SET
        current_time = ?, duration = ?, updated_at = CURRENT_TIMESTAMP
    `).run(video_path, current_time, duration, current_time, duration);
    res.json({ success: true });
  } catch (error) {
    console.error('Save progress error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get watch progress
app.get('/api/progress', requireAuth, (req, res) => {
  try {
    const { video_path } = req.query;
    if (!video_path) {
      return res.status(400).json({ error: 'video_path parameter required' });
    }
    const progress = db.prepare('SELECT current_time, duration FROM watch_progress WHERE video_path = ?').get(video_path);
    res.json({ progress: progress || null });
  } catch (error) {
    console.error('Get progress error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 3: Test manually**

In browser DevTools Console:
```javascript
await fetch('/api/favorite', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({video_path:'test/video.mp4'})}).then(r=>r.json())
// Should return {success: true, favorited: true}
await fetch('/api/favorite', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({video_path:'test/video.mp4'})}).then(r=>r.json())
// Should return {success: true, favorited: false} (toggled off)
```

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add favorites toggle and watch progress API endpoints"
```

---

### Task 4: Trash API Endpoints & Modified Delete

**Files:**
- Modify: `server.js:619-669` (replace `DELETE /api/video` handler with trash-based version)
- Modify: `server.js` (add trash management endpoints after progress endpoints)

**Interfaces:**
- Consumes: `trash` table from Task 1, `trashDir` variable from Task 1, `requireAuth`, `sanitizePath()`
- Produces: Modified `DELETE /api/video` (moves to trash), `GET /api/trash`, `POST /api/trash/restore`, `DELETE /api/trash/:id`, `POST /api/trash/empty`

- [ ] **Step 1: Replace the `DELETE /api/video` handler**

Replace the entire `app.delete('/api/video', ...)` handler (lines 619-669 in original server.js) with this trash-based version:

```javascript
// Delete video file(s) - moves to trash instead of permanent deletion
app.delete('/api/video', requireAuth, async (req, res) => {
  try {
    const { path: singlePath, paths: multiplePaths } = req.body;
    const pathsToDelete = multiplePaths || (singlePath ? [singlePath] : []);

    if (pathsToDelete.length === 0) {
      return res.status(400).json({ error: 'No files specified for deletion' });
    }

    const results = { deleted: [], failed: [] };

    for (const filePath of pathsToDelete) {
      try {
        const fullPath = sanitizePath(filePath);
        const stats = await fs.promises.stat(fullPath);
        if (!stats.isFile()) {
          results.failed.push({ path: filePath, error: 'Invalid file' });
          continue;
        }

        const fileName = path.basename(fullPath);
        const trashFileName = `${Date.now()}_${fileName}`;
        const trashFullPath = path.join(trashDir, trashFileName);

        await fs.promises.rename(fullPath, trashFullPath);

        db.prepare(`INSERT INTO trash (original_path, trash_path, original_name, size) VALUES (?, ?, ?, ?)`)
          .run(filePath, trashFileName, fileName, stats.size);

        results.deleted.push(filePath);
        console.log(`Moved to trash: ${filePath}`);
      } catch (error) {
        console.error(`Failed to trash ${filePath}:`, error.message);
        results.failed.push({ path: filePath, error: error.message });
      }
    }

    const lastTrashId = results.deleted.length > 0
      ? db.prepare('SELECT id FROM trash ORDER BY id DESC LIMIT 1').get()?.id
      : null;

    res.json({
      success: true,
      deleted: results.deleted.length,
      failed: results.failed.length,
      details: results,
      lastTrashId: lastTrashId
    });
  } catch (error) {
    console.error('Delete error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 2: Add trash management endpoints**

After the watch progress endpoints, add:

```javascript
// ===== TRASH API =====

// List trash items
app.get('/api/trash', requireAuth, (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM trash ORDER BY deleted_at DESC').all();
    res.json({ items });
  } catch (error) {
    console.error('List trash error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Restore from trash
app.post('/api/trash/restore', requireAuth, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });

    const item = db.prepare('SELECT * FROM trash WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Trash item not found' });

    const trashFullPath = path.join(trashDir, item.trash_path);
    if (!fs.existsSync(trashFullPath)) {
      db.prepare('DELETE FROM trash WHERE id = ?').run(id);
      return res.status(404).json({ error: 'File no longer exists in trash' });
    }

    const restorePath = sanitizePath(item.original_path);
    const restoreDir = path.dirname(restorePath);
    if (!fs.existsSync(restoreDir)) {
      await fs.promises.mkdir(restoreDir, { recursive: true });
    }

    await fs.promises.rename(trashFullPath, restorePath);
    db.prepare('DELETE FROM trash WHERE id = ?').run(id);

    res.json({ success: true, restoredPath: item.original_path });
  } catch (error) {
    console.error('Restore error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Permanently delete from trash
app.delete('/api/trash/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = db.prepare('SELECT * FROM trash WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Trash item not found' });

    const trashFullPath = path.join(trashDir, item.trash_path);
    if (fs.existsSync(trashFullPath)) {
      await fs.promises.unlink(trashFullPath);
    }
    db.prepare('DELETE FROM trash WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Permanent delete error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Empty entire trash
app.post('/api/trash/empty', requireAuth, async (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM trash').all();
    let deleted = 0;
    for (const item of items) {
      try {
        const trashFullPath = path.join(trashDir, item.trash_path);
        if (fs.existsSync(trashFullPath)) {
          await fs.promises.unlink(trashFullPath);
        }
        deleted++;
      } catch (e) {
        console.warn(`Failed to delete trash file: ${item.trash_path}`);
      }
    }
    db.prepare('DELETE FROM trash').run();
    res.json({ success: true, deleted });
  } catch (error) {
    console.error('Empty trash error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 3: Test manually**

Create a test file in the video directory. Delete it via the app. Check it appears in `.trash/` directory and in `GET /api/trash`. Restore it and verify it's back in its original location.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add trash/recycle bin - delete moves to trash with restore support"
```

---

### Task 5: Subtitle & Batch & Stats & Duplicates API Endpoints

**Files:**
- Modify: `server.js` (add endpoints after trash endpoints)

**Interfaces:**
- Consumes: `requireAuth`, `sanitizePath()`, `isVideoFile()`, `getFileType()`, `config.videoDirectory`, `config.maxRecursionDepth`, `trashDir`, `db` (for batch operations using existing tables + tags/favorites from Tasks 1-3)
- Produces: `GET /api/subtitles`, `GET /api/subtitle/file`, `POST /api/video/move`, `POST /api/video/batch-tag`, `POST /api/video/batch-rate`, `POST /api/video/batch-favorite`, `GET /api/stats`, `GET /api/duplicates`

- [ ] **Step 1: Add subtitle endpoints**

```javascript
// ===== SUBTITLE API =====

// Get available subtitles for a video
app.get('/api/subtitles', requireAuth, (req, res) => {
  try {
    const videoPath = req.query.video_path;
    if (!videoPath) return res.status(400).json({ error: 'video_path required' });

    const fullPath = sanitizePath(videoPath);
    const dir = path.dirname(fullPath);
    const baseName = path.basename(fullPath, path.extname(fullPath));
    const subtitleExts = ['.srt', '.vtt', '.ass'];
    const subtitles = [];

    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (subtitleExts.includes(ext) && file.startsWith(baseName)) {
          const remaining = file.slice(baseName.length, -ext.length);
          const lang = remaining.replace(/^\./, '') || 'default';
          subtitles.push({
            filename: file,
            path: path.relative(config.videoDirectory, path.join(dir, file)),
            language: lang,
            format: ext.slice(1)
          });
        }
      }
    }

    res.json({ subtitles });
  } catch (error) {
    console.error('Subtitles error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Serve subtitle file (convert SRT to WebVTT on the fly)
app.get('/api/subtitle/file', requireAuth, (req, res) => {
  try {
    const subPath = req.query.path;
    if (!subPath) return res.status(400).json({ error: 'path required' });

    const fullPath = sanitizePath(subPath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Subtitle not found' });

    const ext = path.extname(fullPath).toLowerCase();
    let content = fs.readFileSync(fullPath, 'utf8');

    if (ext === '.srt') {
      content = 'WEBVTT\n\n' + content
        .replace(/\r\n/g, '\n')
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    } else if (ext === '.vtt') {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    } else {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }

    res.send(content);
  } catch (error) {
    console.error('Subtitle file error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 2: Add batch operation endpoints**

```javascript
// ===== BATCH OPERATIONS API =====

// Move files to a different folder
app.post('/api/video/move', requireAuth, async (req, res) => {
  try {
    const { paths, destination } = req.body;
    if (!paths || !paths.length || destination === undefined) {
      return res.status(400).json({ error: 'paths and destination required' });
    }

    const destFullPath = sanitizePath(destination);
    if (!fs.existsSync(destFullPath) || !(await fs.promises.stat(destFullPath)).isDirectory()) {
      return res.status(400).json({ error: 'Destination folder does not exist' });
    }

    const results = { moved: [], failed: [] };
    for (const filePath of paths) {
      try {
        const srcFullPath = sanitizePath(filePath);
        const fileName = path.basename(srcFullPath);
        const newFullPath = path.join(destFullPath, fileName);

        if (fs.existsSync(newFullPath)) {
          results.failed.push({ path: filePath, error: 'File already exists at destination' });
          continue;
        }

        await fs.promises.rename(srcFullPath, newFullPath);
        const newRelPath = path.relative(config.videoDirectory, newFullPath);

        // Update DB references
        db.prepare('UPDATE album_videos SET video_path = ? WHERE video_path = ?').run(newRelPath, filePath);
        db.prepare('UPDATE video_ratings SET video_path = ? WHERE video_path = ?').run(newRelPath, filePath);
        db.prepare('UPDATE video_history SET video_path = ? WHERE video_path = ?').run(newRelPath, filePath);
        db.prepare('UPDATE video_tags SET video_path = ? WHERE video_path = ?').run(newRelPath, filePath);
        db.prepare('UPDATE favorites SET video_path = ? WHERE video_path = ?').run(newRelPath, filePath);
        db.prepare('UPDATE watch_progress SET video_path = ? WHERE video_path = ?').run(newRelPath, filePath);

        results.moved.push({ from: filePath, to: newRelPath });
      } catch (error) {
        results.failed.push({ path: filePath, error: error.message });
      }
    }

    res.json({ success: true, moved: results.moved.length, failed: results.failed.length, details: results });
  } catch (error) {
    console.error('Move error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Batch add tag
app.post('/api/video/batch-tag', requireAuth, (req, res) => {
  try {
    const { paths, tag_id } = req.body;
    if (!paths || !paths.length || !tag_id) {
      return res.status(400).json({ error: 'paths and tag_id required' });
    }
    let added = 0;
    for (const p of paths) {
      try {
        db.prepare('INSERT OR IGNORE INTO video_tags (video_path, tag_id) VALUES (?, ?)').run(p, tag_id);
        added++;
      } catch (e) { /* ignore duplicates */ }
    }
    res.json({ success: true, added });
  } catch (error) {
    console.error('Batch tag error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Batch rate
app.post('/api/video/batch-rate', requireAuth, (req, res) => {
  try {
    const { paths, rating } = req.body;
    if (!paths || !paths.length || !rating) {
      return res.status(400).json({ error: 'paths and rating required' });
    }
    const parsedRating = parseInt(rating, 10);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ error: 'rating must be 1-5' });
    }
    for (const p of paths) {
      db.prepare(`
        INSERT INTO video_ratings (video_path, rating, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(video_path) DO UPDATE SET rating = ?, updated_at = CURRENT_TIMESTAMP
      `).run(p, parsedRating, parsedRating);
    }
    res.json({ success: true, count: paths.length });
  } catch (error) {
    console.error('Batch rate error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Batch favorite toggle
app.post('/api/video/batch-favorite', requireAuth, (req, res) => {
  try {
    const { paths } = req.body;
    if (!paths || !paths.length) {
      return res.status(400).json({ error: 'paths required' });
    }
    let added = 0, removed = 0;
    for (const p of paths) {
      const existing = db.prepare('SELECT id FROM favorites WHERE video_path = ?').get(p);
      if (existing) {
        db.prepare('DELETE FROM favorites WHERE video_path = ?').run(p);
        removed++;
      } else {
        db.prepare('INSERT INTO favorites (video_path) VALUES (?)').run(p);
        added++;
      }
    }
    res.json({ success: true, added, removed });
  } catch (error) {
    console.error('Batch favorite error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 3: Add stats endpoint**

```javascript
// ===== STATS API =====

app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const stats = {
      totalFiles: 0, totalSize: 0,
      byType: {}, byExtension: {},
      topFiles: [], topFolders: {},
      trashCount: 0, trashSize: 0
    };

    async function scanDir(dirPath, depth = 0) {
      if (depth > config.maxRecursionDepth) return;
      try {
        const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
        for (const item of items) {
          if (item.name.startsWith('.')) continue;
          const itemPath = path.join(dirPath, item.name);
          if (item.isDirectory()) {
            await scanDir(itemPath, depth + 1);
          } else if (item.isFile()) {
            const fileStat = await fs.promises.stat(itemPath);
            const relPath = path.relative(config.videoDirectory, itemPath);
            const fileType = getFileType(item.name);
            const ext = path.extname(item.name).toLowerCase();
            const folder = path.dirname(relPath) || 'Root';

            stats.totalFiles++;
            stats.totalSize += fileStat.size;

            if (!stats.byType[fileType]) stats.byType[fileType] = { count: 0, size: 0 };
            stats.byType[fileType].count++;
            stats.byType[fileType].size += fileStat.size;

            if (!stats.byExtension[ext]) stats.byExtension[ext] = 0;
            stats.byExtension[ext]++;

            if (!stats.topFolders[folder]) stats.topFolders[folder] = { count: 0, size: 0 };
            stats.topFolders[folder].count++;
            stats.topFolders[folder].size += fileStat.size;

            stats.topFiles.push({ name: item.name, path: relPath, size: fileStat.size });
          }
        }
      } catch (e) { /* skip unreadable dirs */ }
    }

    await scanDir(config.videoDirectory);

    stats.topFiles.sort((a, b) => b.size - a.size);
    stats.topFiles = stats.topFiles.slice(0, 10);

    const folderArr = Object.entries(stats.topFolders)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);
    stats.topFolders = folderArr;

    const trashItems = db.prepare('SELECT size FROM trash').all();
    stats.trashCount = trashItems.length;
    stats.trashSize = trashItems.reduce((sum, i) => sum + (i.size || 0), 0);

    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 4: Add duplicates endpoint**

```javascript
// ===== DUPLICATES API =====

app.get('/api/duplicates', requireAuth, async (req, res) => {
  try {
    const fileMap = new Map();

    async function scanDir(dirPath, depth = 0) {
      if (depth > config.maxRecursionDepth) return;
      try {
        const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
        for (const item of items) {
          if (item.name.startsWith('.')) continue;
          const itemPath = path.join(dirPath, item.name);
          if (item.isDirectory()) {
            await scanDir(itemPath, depth + 1);
          } else if (item.isFile()) {
            const fileStat = await fs.promises.stat(itemPath);
            const relPath = path.relative(config.videoDirectory, itemPath);
            const ext = path.extname(item.name).toLowerCase();
            const nameKey = `name:${item.name.toLowerCase()}`;
            const sizeKey = `size:${fileStat.size}:${ext}`;

            const entry = { name: item.name, path: relPath, size: fileStat.size, modified: fileStat.mtime };

            if (!fileMap.has(nameKey)) fileMap.set(nameKey, []);
            fileMap.get(nameKey).push(entry);

            if (!fileMap.has(sizeKey)) fileMap.set(sizeKey, []);
            fileMap.get(sizeKey).push(entry);
          }
        }
      } catch (e) { /* skip unreadable dirs */ }
    }

    await scanDir(config.videoDirectory);

    const groups = [];
    const seen = new Set();
    for (const [key, files] of fileMap) {
      if (files.length < 2) continue;
      const groupKey = files.map(f => f.path).sort().join('|');
      if (seen.has(groupKey)) continue;
      seen.add(groupKey);
      const type = key.startsWith('name:') ? 'same-name' : 'same-size';
      groups.push({ type, criterion: key.split(':').slice(1).join(':'), files });
    }

    res.json({ groups, totalGroups: groups.length });
  } catch (error) {
    console.error('Duplicates error:', error.message);
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 5: Test the stats endpoint**

Start the server, log in, run `fetch('/api/stats').then(r=>r.json()).then(console.log)` in DevTools. Verify it returns file counts and sizes.

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat: add subtitle, batch ops, stats, and duplicate detection API endpoints"
```

---

### Task 6: Enrich Browse & Search Responses with Favorites/Tags/Progress

**Files:**
- Modify: `server.js:281-332` (`readDirectoryRecursive()`)
- Modify: `server.js:444-516` (`searchVideosRecursive()`)

**Interfaces:**
- Consumes: `favorites`, `video_tags`, `tags`, `watch_progress` tables
- Produces: Each file object in browse/search responses now includes `favorite` (boolean), `tags` (array of `{id, name, color}`), `progress` (number 0-100 or null)

- [ ] **Step 1: Modify `readDirectoryRecursive()` to include favorites, tags, and progress**

In the `readDirectoryRecursive()` function, after the ratings pre-fetch block (after line 299), add these pre-fetch blocks:

```javascript
    // Pre-fetch all favorites
    const favList = db.prepare('SELECT video_path FROM favorites').all();
    const favSet = new Set(favList.map(f => f.video_path));

    // Pre-fetch all video tags with tag details
    const tagsList = db.prepare(`
      SELECT vt.video_path, t.id as tag_id, t.name, t.color
      FROM video_tags vt JOIN tags t ON vt.tag_id = t.id
    `).all();
    const tagsMap = new Map();
    for (const t of tagsList) {
      if (!tagsMap.has(t.video_path)) tagsMap.set(t.video_path, []);
      tagsMap.get(t.video_path).push({ id: t.tag_id, name: t.name, color: t.color });
    }

    // Pre-fetch watch progress
    const progressList = db.prepare('SELECT video_path, current_time, duration FROM watch_progress').all();
    const progressMap = new Map();
    for (const p of progressList) {
      if (p.duration > 0) {
        progressMap.set(p.video_path, Math.round((p.current_time / p.duration) * 100));
      }
    }
```

Then in the file object being pushed to `result.files` (around line 317-324), add these three fields after `rating`:

```javascript
          favorite: favSet.has(relativePath),
          tags: tagsMap.get(relativePath) || [],
          progress: progressMap.get(relativePath) ?? null
```

- [ ] **Step 2: Apply the same enrichment to `searchVideosRecursive()`**

Add the same favorites, tags, and progress pre-fetch blocks at the top of `searchVideosRecursive()` (after the `seenSet` block, around line 458). Then add the three new fields to the result object pushed in the search function (around line 495-504), after the `seen` field:

```javascript
              favorite: favSet.has(relativePath),
              tags: tagsMap.get(relativePath) || [],
              progress: progressMap.get(relativePath) ?? null
```

- [ ] **Step 3: Test manually**

Browse a directory, check the API response in DevTools Network tab. Each file should now have `favorite`, `tags`, and `progress` fields.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: enrich browse/search responses with favorites, tags, and progress data"
```

---

### Task 7: HTML - New Header Buttons, Sidebar Filters, Player Controls, and Modals

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Produces: All new DOM elements referenced by Tasks 8-10 (app.js). Element IDs listed below are the contract between HTML and JS.

- [ ] **Step 1: Add new header buttons**

In `index.html`, inside `.header-right` div (between `albums-btn` and `theme-toggle-btn`, around line 50-51), add:

```html
        <button id="tags-manage-btn" class="btn-secondary">🏷 Tags</button>
        <button id="stats-btn" class="btn-secondary">📊 Stats</button>
        <button id="trash-btn" class="btn-secondary">🗑 Trash <span id="trash-badge" class="badge" style="display:none;">0</span></button>
```

Also, inside `.header-right`, after the existing `delete-btn` and before `logout-btn` (around line 58), add new selection-mode action buttons:

```html
        <button id="batch-move-btn" class="btn-secondary" style="display: none;">📂 Move To</button>
        <button id="batch-tag-btn" class="btn-secondary" style="display: none;">🏷 Tag</button>
        <button id="batch-rate-btn" class="btn-secondary" style="display: none;">⭐ Rate</button>
        <button id="batch-fav-btn" class="btn-secondary" style="display: none;">♥ Favorite</button>
        <button id="select-all-btn" class="btn-secondary" style="display: none;">☑ All</button>
```

- [ ] **Step 2: Add sort dropdown and advanced filters to sidebar**

In `index.html`, inside `.search-container` div (after the `rating-filter` select, around line 77), add:

```html
          <select id="sort-select" class="rating-filter" style="margin-top: 8px;">
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="date-desc" selected>Date (newest)</option>
            <option value="date-asc">Date (oldest)</option>
            <option value="size-desc">Size (largest)</option>
            <option value="size-asc">Size (smallest)</option>
            <option value="rating-desc">Rating (highest)</option>
            <option value="rating-asc">Rating (lowest)</option>
          </select>
          <div id="advanced-filters" class="advanced-filters">
            <label class="filter-toggle"><input type="checkbox" id="filter-favorites"> ♥ Favorites only</label>
            <label class="filter-toggle"><input type="checkbox" id="filter-unseen"> Unseen only</label>
            <select id="filter-type" class="rating-filter" style="margin-top: 5px;">
              <option value="">All Types</option>
              <option value="video">Video</option>
              <option value="image">Image</option>
              <option value="audio">Audio</option>
              <option value="document">Document</option>
              <option value="archive">Archive</option>
            </select>
            <div id="filter-tags-container" class="filter-tags-container"></div>
            <button id="clear-filters-btn" class="btn-secondary" style="margin-top: 5px; width: 100%; font-size: 0.85em;">Clear Filters</button>
          </div>
```

- [ ] **Step 3: Add favorite and tag controls to player header, plus PiP and subtitle controls**

In `index.html`, inside `.player-header` div (after the `video-rating-container`, around line 108), add:

```html
            <button id="player-fav-btn" class="btn-fav" title="Toggle Favorite">♡</button>
            <div id="player-tags-container" class="player-tags"></div>
```

In the `.video-controls` div (after the `fullscreen-btn`, around line 124), add before `delete-video-btn`:

```html
            <button id="pip-btn" class="btn-secondary" title="Picture-in-Picture">⧉ PiP</button>
            <button id="subtitle-toggle-btn" class="btn-secondary" style="display:none;" title="Toggle Subtitles">CC</button>
            <select id="subtitle-select" class="playback-speed-select" style="display:none;"></select>
            <button id="queue-toggle-btn" class="btn-secondary" title="Toggle Queue">☰ Queue</button>
```

- [ ] **Step 4: Add the queue panel inside video-player-container**

In `index.html`, inside `video-player-container` (after the `.video-controls` div, before the closing `</div>` of the container around line 128), add:

```html
          <div id="queue-panel" class="queue-panel" style="display:none;">
            <div class="queue-header">
              <h3>Queue</h3>
              <div>
                <button id="queue-shuffle-btn" class="btn-secondary btn-sm">🔀</button>
                <button id="queue-clear-btn" class="btn-secondary btn-sm">Clear</button>
              </div>
            </div>
            <div id="queue-list" class="queue-list"></div>
          </div>
          <div id="autoplay-countdown" class="autoplay-countdown" style="display:none;">
            <p>Next: <span id="countdown-title"></span></p>
            <p>Playing in <span id="countdown-seconds">3</span>s</p>
            <button id="countdown-cancel" class="btn-secondary btn-sm">Cancel</button>
          </div>
```

- [ ] **Step 5: Add a "Play All" and "Add to Queue" button area above video list**

In `index.html`, inside `.content-area` (before the `video-list` div, around line 91), add:

```html
        <div class="content-actions" id="content-actions" style="display:none;">
          <button id="play-all-btn" class="btn-secondary btn-sm">▶ Play All</button>
          <button id="add-all-queue-btn" class="btn-secondary btn-sm">+ Queue All</button>
        </div>
```

- [ ] **Step 6: Add resume toast**

After the `status-bar` footer (around line 136), add:

```html
    <!-- Resume Toast -->
    <div id="resume-toast" class="toast" style="display:none;">
      <p>Resume from <span id="resume-time"></span>?</p>
      <button id="resume-yes" class="btn-primary btn-sm">Resume</button>
      <button id="resume-no" class="btn-secondary btn-sm">Start Over</button>
    </div>

    <!-- Undo Delete Toast -->
    <div id="undo-toast" class="toast" style="display:none;">
      <p>File moved to trash</p>
      <button id="undo-restore-btn" class="btn-primary btn-sm">Undo</button>
    </div>
```

- [ ] **Step 7: Add new modals (Tags Manager, Stats Dashboard, Trash View, Folder Picker, Batch Rate)**

After the existing modals (after the `album-detail-view` modal), add:

```html
  <!-- Tags Manager Modal -->
  <div id="tags-modal" class="modal" style="display: none;">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Manage Tags</h3>
        <button id="tags-modal-close" class="btn-close">✕</button>
      </div>
      <div class="tag-create-row">
        <input type="text" id="new-tag-name" class="modal-input" placeholder="Tag name" style="margin-bottom:0; flex:1;">
        <input type="color" id="new-tag-color" value="#667eea" style="width:40px; height:38px; border:none; cursor:pointer;">
        <button id="create-tag-btn" class="btn-primary" style="width:auto;">Add</button>
      </div>
      <div id="tags-list" class="tags-list"></div>
    </div>
  </div>

  <!-- Stats Dashboard Modal -->
  <div id="stats-modal" class="modal" style="display: none;">
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h2>📊 Library Stats</h2>
        <button id="stats-modal-close" class="btn-close">✕</button>
      </div>
      <div class="modal-body">
        <div id="stats-summary" class="stats-summary"></div>
        <h3>File Types</h3>
        <div id="stats-types" class="stats-bars"></div>
        <h3>Top Folders by Size</h3>
        <div id="stats-folders"></div>
        <h3>Largest Files</h3>
        <div id="stats-files"></div>
        <h3>Format Distribution</h3>
        <div id="stats-formats"></div>
        <hr style="border-color: rgba(255,255,255,0.1); margin: 20px 0;">
        <button id="find-duplicates-btn" class="btn-secondary">🔍 Find Duplicates</button>
        <div id="duplicates-results" style="margin-top: 15px;"></div>
      </div>
    </div>
  </div>

  <!-- Trash View Modal -->
  <div id="trash-modal" class="modal" style="display: none;">
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h2>🗑 Trash</h2>
        <button id="trash-modal-close" class="btn-close">✕</button>
      </div>
      <div class="modal-body">
        <button id="empty-trash-btn" class="btn-delete">Empty Trash</button>
        <div id="trash-list" style="margin-top: 15px;"></div>
      </div>
    </div>
  </div>

  <!-- Folder Picker Modal (for batch move) -->
  <div id="folder-picker-modal" class="modal" style="display: none;">
    <div class="modal-content">
      <h3>Move To Folder</h3>
      <div id="folder-tree" class="folder-tree"></div>
      <div class="modal-actions">
        <button id="folder-pick-confirm" class="btn-primary">Move Here</button>
        <button id="folder-pick-cancel" class="btn-secondary">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Batch Rate Modal -->
  <div id="batch-rate-modal" class="modal" style="display: none;">
    <div class="modal-content">
      <h3>Rate Selected Files</h3>
      <div class="video-rating batch-rating">
        <span class="star batch-star" data-value="1">★</span>
        <span class="star batch-star" data-value="2">★</span>
        <span class="star batch-star" data-value="3">★</span>
        <span class="star batch-star" data-value="4">★</span>
        <span class="star batch-star" data-value="5">★</span>
      </div>
      <div class="modal-actions">
        <button id="batch-rate-cancel" class="btn-secondary">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Batch Tag Modal -->
  <div id="batch-tag-modal" class="modal" style="display: none;">
    <div class="modal-content">
      <h3>Tag Selected Files</h3>
      <div id="batch-tag-list"></div>
      <div class="modal-actions">
        <button id="batch-tag-cancel" class="btn-secondary">Cancel</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 8: Commit**

```bash
git add public/index.html
git commit -m "feat: add HTML structure for all new modals, controls, filters, and panels"
```

---

### Task 8: CSS - Styles for All New UI Components

**Files:**
- Modify: `public/styles.css` (append new styles at the end, before the light-theme overrides section)

**Interfaces:**
- Consumes: CSS class names used in Task 7's HTML and Tasks 9-10's dynamically generated HTML

- [ ] **Step 1: Add all new styles**

Append these styles to `public/styles.css` before the `/* Light Theme Overrides */` section (before line 1137):

```css
/* ===== ADVANCED FEATURES STYLES ===== */

/* Badge */
.badge {
  background: #ff6b6b;
  color: white;
  border-radius: 10px;
  padding: 1px 6px;
  font-size: 0.75em;
  margin-left: 4px;
  vertical-align: middle;
}

/* Tag Chips */
.tag-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75em;
  color: white;
  margin: 2px;
  white-space: nowrap;
}

.tag-chip-removable {
  cursor: pointer;
}

.tag-chip-removable:hover {
  opacity: 0.7;
}

.player-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

/* Tags Manager */
.tag-create-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 15px;
}

.tags-list {
  max-height: 300px;
  overflow-y: auto;
}

.tag-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.tag-list-item:last-child {
  border-bottom: none;
}

.tag-list-item .tag-chip {
  font-size: 0.9em;
  padding: 4px 12px;
}

/* Favorite Heart */
.btn-fav {
  background: none;
  border: none;
  font-size: 1.5em;
  cursor: pointer;
  color: #ccc;
  transition: color 0.2s, transform 0.2s;
  padding: 0 5px;
}

.btn-fav:hover {
  transform: scale(1.2);
}

.btn-fav.favorited {
  color: #ff6b6b;
}

.video-fav-icon {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 0.9em;
  color: #ff6b6b;
  opacity: 0;
  transition: opacity 0.2s;
}

.video-item:hover .video-fav-icon {
  opacity: 1;
}

.video-item .video-fav-icon.is-fav {
  opacity: 1;
}

/* Progress Bar on Cards */
.video-progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: #667eea;
  border-radius: 0 0 12px 12px;
  transition: width 0.3s;
}

.video-item {
  position: relative;
  overflow: hidden;
}

/* Advanced Filters */
.advanced-filters {
  margin-top: 8px;
}

.filter-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 0.85em;
  color: #b0b0b0;
  cursor: pointer;
}

.filter-toggle input[type="checkbox"] {
  accent-color: #667eea;
}

.filter-tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.filter-tag {
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.filter-tag.active {
  opacity: 1;
}

/* Content Actions Bar */
.content-actions {
  display: flex;
  gap: 8px;
  padding: 8px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.btn-sm {
  padding: 4px 12px;
  font-size: 0.85em;
}

/* Queue Panel */
.queue-panel {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  background: rgba(0,0,0,0.9);
  border-left: 1px solid rgba(255,255,255,0.1);
  display: flex;
  flex-direction: column;
  z-index: 5;
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.queue-header h3 {
  margin: 0;
  font-size: 1em;
}

.queue-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.queue-item {
  display: flex;
  align-items: center;
  padding: 8px;
  margin-bottom: 4px;
  background: rgba(255,255,255,0.05);
  border-radius: 6px;
  font-size: 0.85em;
  cursor: grab;
}

.queue-item:active {
  cursor: grabbing;
}

.queue-item.playing {
  background: rgba(102,126,234,0.3);
  border: 1px solid #667eea;
}

.queue-item .queue-remove {
  margin-left: auto;
  cursor: pointer;
  color: #888;
  padding: 0 4px;
}

.queue-item .queue-remove:hover {
  color: #ff6b6b;
}

/* Autoplay Countdown */
.autoplay-countdown {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.85);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 12px;
  padding: 15px 25px;
  text-align: center;
  z-index: 10;
}

.autoplay-countdown p {
  margin: 5px 0;
}

/* Toast Notifications */
.toast {
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30,30,60,0.95);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 12px;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 5000;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}

.toast p {
  margin: 0;
  white-space: nowrap;
}

/* Stats Dashboard */
.stats-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
  margin-bottom: 25px;
}

.stat-card {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}

.stat-card .stat-value {
  font-size: 1.8em;
  font-weight: 700;
  color: #667eea;
}

.stat-card .stat-label {
  font-size: 0.85em;
  color: #a0a0a0;
  margin-top: 4px;
}

.stats-bars {
  margin-bottom: 20px;
}

.stats-bar-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  gap: 10px;
}

.stats-bar-label {
  width: 80px;
  font-size: 0.85em;
  text-align: right;
  color: #b0b0b0;
}

.stats-bar-track {
  flex: 1;
  height: 20px;
  background: rgba(255,255,255,0.05);
  border-radius: 4px;
  overflow: hidden;
}

.stats-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  border-radius: 4px;
  transition: width 0.5s;
}

.stats-bar-value {
  width: 100px;
  font-size: 0.8em;
  color: #a0a0a0;
}

/* Trash List */
.trash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.trash-item-info {
  flex: 1;
}

.trash-item-name {
  font-weight: 500;
}

.trash-item-meta {
  font-size: 0.8em;
  color: #a0a0a0;
  margin-top: 2px;
}

.trash-item-actions {
  display: flex;
  gap: 6px;
}

/* Duplicates */
.duplicate-group {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 12px;
}

.duplicate-group-header {
  font-weight: 500;
  margin-bottom: 10px;
  color: #b0b0b0;
  font-size: 0.9em;
}

.duplicate-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}

.duplicate-file:last-child {
  border-bottom: none;
}

/* Folder Picker Tree */
.folder-tree {
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 15px;
}

.folder-tree-item {
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
}

.folder-tree-item:hover {
  background: rgba(102,126,234,0.2);
}

.folder-tree-item.selected {
  background: rgba(102,126,234,0.3);
  border: 1px solid #667eea;
}

/* Subtitle indicator */
.subtitle-indicator {
  font-size: 0.7em;
  background: rgba(102,126,234,0.3);
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: 4px;
}

/* PiP overlay */
.pip-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
  cursor: pointer;
  font-size: 1.2em;
  color: #b0b0b0;
}

/* Batch Rating Stars */
.batch-rating {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin: 20px 0;
  font-size: 2em;
}

.batch-star {
  cursor: pointer;
  color: #ccc;
  transition: color 0.2s;
}

.batch-star:hover, .batch-star.hovered {
  color: #ffc107;
}
```

- [ ] **Step 2: Add light-theme overrides for new components**

At the end of the existing `[data-theme="light"]` section, add:

```css
[data-theme="light"] .toast {
  background: rgba(255,255,255,0.95);
  border-color: rgba(0,0,0,0.1);
  color: #333;
}

[data-theme="light"] .queue-panel {
  background: rgba(255,255,255,0.95);
  border-color: rgba(0,0,0,0.1);
  color: #333;
}

[data-theme="light"] .queue-item {
  background: rgba(0,0,0,0.03);
}

[data-theme="light"] .stat-card {
  background: rgba(255,255,255,0.7);
  border-color: rgba(0,0,0,0.1);
}

[data-theme="light"] .stat-card .stat-label,
[data-theme="light"] .stats-bar-label,
[data-theme="light"] .trash-item-meta,
[data-theme="light"] .filter-toggle {
  color: #666;
}

[data-theme="light"] .autoplay-countdown {
  background: rgba(255,255,255,0.95);
  border-color: rgba(0,0,0,0.1);
  color: #333;
}

[data-theme="light"] .duplicate-group {
  background: rgba(255,255,255,0.5);
  border-color: rgba(0,0,0,0.1);
}
```

- [ ] **Step 3: Commit**

```bash
git add public/styles.css
git commit -m "feat: add CSS styles for tags, favorites, queue, stats, trash, and all new UI components"
```

---

### Task 9: JavaScript - Smart Organization (Tags, Favorites, Sort, Filters)

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: DOM elements from Task 7, API endpoints from Tasks 2-3 and 6, enriched file data with `favorite`, `tags`, `progress` fields
- Produces: Functions: `loadAllTags()`, `toggleFavorite(path)`, `sortFiles(files)`, `applyFilters(files)`, modified `displayVideos()` to show tags/fav/progress on cards, modified `init()` with new event listeners

- [ ] **Step 1: Add new state variables at the top of app.js**

After the existing state variables (after line 49), add:

```javascript
// Smart Organization state
let allTags = [];
let filterTags = new Set();
let currentSort = localStorage.getItem('videoLibrarySort') || 'date-desc';
let favoritesSet = new Set();
let videoQueue = JSON.parse(sessionStorage.getItem('videoQueue') || '[]');
let queueIndex = -1;
let autoplayTimer = null;
let progressSaveTimer = null;
```

- [ ] **Step 2: Add new DOM element references**

After the existing DOM element references (around line 160), add:

```javascript
// Advanced feature DOM elements
const tagsManageBtn = document.getElementById('tags-manage-btn');
const statsBtn = document.getElementById('stats-btn');
const trashBtn = document.getElementById('trash-btn');
const trashBadge = document.getElementById('trash-badge');
const sortSelect = document.getElementById('sort-select');
const filterFavorites = document.getElementById('filter-favorites');
const filterUnseen = document.getElementById('filter-unseen');
const filterType = document.getElementById('filter-type');
const filterTagsContainer = document.getElementById('filter-tags-container');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
const contentActions = document.getElementById('content-actions');
const playAllBtn = document.getElementById('play-all-btn');
const addAllQueueBtn = document.getElementById('add-all-queue-btn');
const playerFavBtn = document.getElementById('player-fav-btn');
const playerTagsContainer = document.getElementById('player-tags-container');
const batchMoveBtn = document.getElementById('batch-move-btn');
const batchTagBtn = document.getElementById('batch-tag-btn');
const batchRateBtn = document.getElementById('batch-rate-btn');
const batchFavBtn = document.getElementById('batch-fav-btn');
const selectAllBtn = document.getElementById('select-all-btn');
```

- [ ] **Step 3: Add new event listeners in `init()`**

Inside the `init()` function, after the existing event listeners (before `document.addEventListener('keydown', handleKeyboard);`), add:

```javascript
    // Advanced feature event listeners
    if (tagsManageBtn) tagsManageBtn.addEventListener('click', showTagsManager);
    if (statsBtn) statsBtn.addEventListener('click', showStats);
    if (trashBtn) trashBtn.addEventListener('click', showTrash);
    if (sortSelect) sortSelect.addEventListener('change', () => { currentSort = sortSelect.value; localStorage.setItem('videoLibrarySort', currentSort); refreshDisplay(); });
    if (filterFavorites) filterFavorites.addEventListener('change', refreshDisplay);
    if (filterUnseen) filterUnseen.addEventListener('change', refreshDisplay);
    if (filterType) filterType.addEventListener('change', refreshDisplay);
    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearAllFilters);
    if (playAllBtn) playAllBtn.addEventListener('click', playAll);
    if (addAllQueueBtn) addAllQueueBtn.addEventListener('click', addAllToQueue);
    if (playerFavBtn) playerFavBtn.addEventListener('click', toggleCurrentVideoFavorite);
    if (batchMoveBtn) batchMoveBtn.addEventListener('click', showFolderPicker);
    if (batchTagBtn) batchTagBtn.addEventListener('click', showBatchTagModal);
    if (batchRateBtn) batchRateBtn.addEventListener('click', showBatchRateModal);
    if (batchFavBtn) batchFavBtn.addEventListener('click', batchToggleFavorite);
    if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllFiles);

    // Set initial sort value
    if (sortSelect) sortSelect.value = currentSort;

    // Load initial data
    loadAllTags();
    updateTrashBadge();
```

- [ ] **Step 4: Add tag management functions**

At the end of app.js, add:

```javascript
// ===== TAGS MANAGEMENT =====

async function loadAllTags() {
    try {
        const res = await fetch('/api/tags', { credentials: 'same-origin' });
        if (res.ok) {
            const data = await res.json();
            allTags = data.tags;
            renderFilterTags();
        }
    } catch (e) { console.error('Load tags error:', e); }
}

function renderFilterTags() {
    if (!filterTagsContainer) return;
    filterTagsContainer.innerHTML = allTags.map(tag =>
        `<span class="tag-chip filter-tag ${filterTags.has(tag.id) ? 'active' : ''}" style="background:${tag.color}" data-tag-id="${tag.id}">${escapeHtml(tag.name)}</span>`
    ).join('');
    filterTagsContainer.querySelectorAll('.filter-tag').forEach(el => {
        el.addEventListener('click', () => {
            const tagId = parseInt(el.dataset.tagId);
            if (filterTags.has(tagId)) filterTags.delete(tagId);
            else filterTags.add(tagId);
            el.classList.toggle('active');
            refreshDisplay();
        });
    });
}

async function showTagsManager() {
    document.getElementById('tags-modal').style.display = 'flex';
    await loadAllTags();
    renderTagsList();
    document.getElementById('tags-modal-close').onclick = () => document.getElementById('tags-modal').style.display = 'none';
    document.getElementById('create-tag-btn').onclick = async () => {
        const name = document.getElementById('new-tag-name').value.trim();
        const color = document.getElementById('new-tag-color').value;
        if (!name) return;
        await fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ name, color }) });
        document.getElementById('new-tag-name').value = '';
        await loadAllTags();
        renderTagsList();
    };
}

function renderTagsList() {
    const list = document.getElementById('tags-list');
    list.innerHTML = allTags.map(tag =>
        `<div class="tag-list-item">
            <span class="tag-chip" style="background:${tag.color}">${escapeHtml(tag.name)}</span>
            <button class="btn-secondary btn-sm tag-delete-btn" data-id="${tag.id}">Delete</button>
        </div>`
    ).join('') || '<div class="empty-state">No tags yet</div>';
    list.querySelectorAll('.tag-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            await fetch(`/api/tags/${btn.dataset.id}`, { method: 'DELETE', credentials: 'same-origin' });
            await loadAllTags();
            renderTagsList();
        });
    });
}
```

- [ ] **Step 5: Add favorites functions**

```javascript
// ===== FAVORITES =====

async function toggleFavorite(videoPath) {
    try {
        const res = await fetch('/api/favorite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ video_path: videoPath }) });
        const data = await res.json();
        if (data.favorited) favoritesSet.add(videoPath);
        else favoritesSet.delete(videoPath);
        return data.favorited;
    } catch (e) { console.error('Favorite error:', e); return false; }
}

async function toggleCurrentVideoFavorite() {
    if (!currentVideoPath) return;
    const isFav = await toggleFavorite(currentVideoPath);
    playerFavBtn.textContent = isFav ? '♥' : '♡';
    playerFavBtn.classList.toggle('favorited', isFav);
    refreshDisplay();
}

async function loadFavorites() {
    try {
        const res = await fetch('/api/favorites', { credentials: 'same-origin' });
        if (res.ok) {
            const data = await res.json();
            favoritesSet = new Set(data.favorites);
        }
    } catch (e) { console.error('Load favorites error:', e); }
}
```

- [ ] **Step 6: Add sort and filter functions**

```javascript
// ===== SORT & FILTER =====

function sortFiles(files) {
    const sorted = [...files];
    switch (currentSort) {
        case 'name-asc': sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
        case 'name-desc': sorted.sort((a, b) => b.name.localeCompare(a.name)); break;
        case 'date-desc': sorted.sort((a, b) => new Date(b.modified) - new Date(a.modified)); break;
        case 'date-asc': sorted.sort((a, b) => new Date(a.modified) - new Date(b.modified)); break;
        case 'size-desc': sorted.sort((a, b) => b.size - a.size); break;
        case 'size-asc': sorted.sort((a, b) => a.size - b.size); break;
        case 'rating-desc': sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
        case 'rating-asc': sorted.sort((a, b) => (a.rating || 0) - (b.rating || 0)); break;
    }
    return sorted;
}

function applyFilters(files) {
    let filtered = files;
    if (filterFavorites && filterFavorites.checked) {
        filtered = filtered.filter(f => f.favorite);
    }
    if (filterUnseen && filterUnseen.checked) {
        filtered = filtered.filter(f => !f.seen);
    }
    if (filterType && filterType.value) {
        filtered = filtered.filter(f => f.type === filterType.value);
    }
    if (filterTags.size > 0) {
        filtered = filtered.filter(f => {
            if (!f.tags || f.tags.length === 0) return false;
            const fileTagIds = new Set(f.tags.map(t => t.id));
            for (const tagId of filterTags) {
                if (!fileTagIds.has(tagId)) return false;
            }
            return true;
        });
    }
    return filtered;
}

function refreshDisplay() {
    const filtered = applyFilters(allFiles);
    const sorted = sortFiles(filtered);
    displayVideos(sorted, isSearchMode);
}

function clearAllFilters() {
    if (filterFavorites) filterFavorites.checked = false;
    if (filterUnseen) filterUnseen.checked = false;
    if (filterType) filterType.value = '';
    filterTags.clear();
    document.getElementById('rating-filter').value = '0';
    renderFilterTags();
    refreshDisplay();
}

function selectAllFiles() {
    const displayed = document.querySelectorAll('.video-item');
    if (selectedFiles.size === displayed.length) {
        selectedFiles.clear();
    } else {
        displayed.forEach(item => selectedFiles.add(item.dataset.path));
    }
    updateDeleteButton();
    updateCheckboxes();
}
```

- [ ] **Step 7: Modify `displayVideos()` to include tags, favorites, and progress**

In the existing `displayVideos()` function, modify the return template string for each video item. After the `<div class="video-meta">` line that shows size and date, add these lines:

```javascript
            ${file.tags && file.tags.length ? `<div class="video-tags">${file.tags.map(t => `<span class="tag-chip" style="background:${t.color}">${escapeHtml(t.name)}</span>`).join('')}</div>` : ''}
```

After the closing `</div>` of `video-info`, before the closing `</div>` of `video-item`, add:

```javascript
          ${file.favorite ? '<span class="video-fav-icon is-fav">♥</span>' : ''}
          ${file.progress !== null && file.progress !== undefined && file.progress > 0 && file.progress < 100 ? `<div class="video-progress-bar" style="width:${file.progress}%"></div>` : ''}
```

- [ ] **Step 8: Modify `loadDirectory()` to use sort/filter and show content actions**

In `loadDirectory()`, after `allFiles = data.files || [];`, replace `displayVideos(allFiles);` with:

```javascript
        const filtered = applyFilters(allFiles);
        const sorted = sortFiles(filtered);
        displayVideos(sorted);
        if (contentActions) contentActions.style.display = allFiles.length > 0 ? 'flex' : 'none';
```

Also add `loadFavorites();` call inside `loadDirectory()` after the data is loaded, or better yet, call it once during `init()` after `checkAuthentication()` in the `showApp` flow. Add at the end of `showApp()`:

```javascript
    loadFavorites();
    loadAllTags();
    updateTrashBadge();
```

- [ ] **Step 9: Modify `updateSelectionUI()` to show/hide batch action buttons**

In the existing `updateSelectionUI()` function, inside the `if (selectionMode)` block, add:

```javascript
        if (batchMoveBtn) batchMoveBtn.style.display = 'block';
        if (batchTagBtn) batchTagBtn.style.display = 'block';
        if (batchRateBtn) batchRateBtn.style.display = 'block';
        if (batchFavBtn) batchFavBtn.style.display = 'block';
        if (selectAllBtn) selectAllBtn.style.display = 'block';
```

In the `else` block, add:

```javascript
        if (batchMoveBtn) batchMoveBtn.style.display = 'none';
        if (batchTagBtn) batchTagBtn.style.display = 'none';
        if (batchRateBtn) batchRateBtn.style.display = 'none';
        if (batchFavBtn) batchFavBtn.style.display = 'none';
        if (selectAllBtn) selectAllBtn.style.display = 'none';
```

- [ ] **Step 10: Commit**

```bash
git add public/app.js
git commit -m "feat: add tags, favorites, sort, and advanced filter functionality"
```

---

### Task 10: JavaScript - Playback Features (Resume, Subtitles, Queue, PiP) & Media Management (Trash, Batch Ops, Stats, Duplicates)

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: DOM elements from Task 7, API endpoints from Tasks 3-5, state variables from Task 9
- Produces: Complete set of remaining feature functions

- [ ] **Step 1: Add resume playback functions**

```javascript
// ===== RESUME PLAYBACK =====

function startProgressTracking() {
    stopProgressTracking();
    progressSaveTimer = setInterval(async () => {
        if (videoPlayer && !videoPlayer.paused && videoPlayer.duration > 0) {
            const pct = (videoPlayer.currentTime / videoPlayer.duration) * 100;
            if (pct >= 95) {
                db_deleteProgress(currentVideoPath);
                return;
            }
            try {
                await fetch('/api/progress', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
                    body: JSON.stringify({ video_path: currentVideoPath, current_time: videoPlayer.currentTime, duration: videoPlayer.duration })
                });
            } catch (e) { /* ignore */ }
        }
    }, 5000);
}

function stopProgressTracking() {
    if (progressSaveTimer) { clearInterval(progressSaveTimer); progressSaveTimer = null; }
}

async function db_deleteProgress(videoPath) {
    try {
        await fetch('/api/progress', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ video_path: videoPath, current_time: 0, duration: 1 })
        });
    } catch (e) { /* ignore */ }
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

async function checkAndShowResume(videoPath) {
    try {
        const res = await fetch(`/api/progress?video_path=${encodeURIComponent(videoPath)}`, { credentials: 'same-origin' });
        const data = await res.json();
        if (data.progress && data.progress.current_time > 5) {
            const pct = (data.progress.current_time / data.progress.duration) * 100;
            if (pct < 95) {
                return new Promise(resolve => {
                    const toast = document.getElementById('resume-toast');
                    document.getElementById('resume-time').textContent = formatTime(data.progress.current_time);
                    toast.style.display = 'flex';
                    document.getElementById('resume-yes').onclick = () => { toast.style.display = 'none'; videoPlayer.currentTime = data.progress.current_time; resolve(); };
                    document.getElementById('resume-no').onclick = () => { toast.style.display = 'none'; resolve(); };
                });
            }
        }
    } catch (e) { /* ignore */ }
}
```

- [ ] **Step 2: Modify existing `playVideo()` to integrate resume, subtitles, queue awareness, favorites, and progress tracking**

Find the existing `playVideo()` function. After the line `videoPlayer.play();` (around line 575 in the original), add:

```javascript
    // Resume check
    await checkAndShowResume(path);

    // Start progress tracking
    startProgressTracking();

    // Load subtitles
    loadSubtitles(path);

    // Update favorite button state
    if (playerFavBtn) {
        const isFav = favoritesSet.has(path);
        playerFavBtn.textContent = isFav ? '♥' : '♡';
        playerFavBtn.classList.toggle('favorited', isFav);
    }

    // Load tags for player
    loadPlayerTags(path);

    // Update queue highlight
    updateQueueHighlight();
```

Also modify `closeVideoPlayer()` to stop progress tracking. At the beginning of `closeVideoPlayer()`, add:

```javascript
    stopProgressTracking();
```

- [ ] **Step 3: Add subtitle functions**

```javascript
// ===== SUBTITLES =====

async function loadSubtitles(videoPath) {
    const subtitleBtn = document.getElementById('subtitle-toggle-btn');
    const subtitleSelect = document.getElementById('subtitle-select');

    // Remove existing tracks
    videoPlayer.querySelectorAll('track').forEach(t => t.remove());

    try {
        const res = await fetch(`/api/subtitles?video_path=${encodeURIComponent(videoPath)}`, { credentials: 'same-origin' });
        const data = await res.json();

        if (data.subtitles.length === 0) {
            if (subtitleBtn) subtitleBtn.style.display = 'none';
            if (subtitleSelect) subtitleSelect.style.display = 'none';
            return;
        }

        if (subtitleBtn) subtitleBtn.style.display = 'inline-block';

        if (data.subtitles.length > 1 && subtitleSelect) {
            subtitleSelect.style.display = 'inline-block';
            subtitleSelect.innerHTML = data.subtitles.map((s, i) =>
                `<option value="${i}">${escapeHtml(s.language)} (${s.format})</option>`
            ).join('');
            subtitleSelect.onchange = () => {
                const idx = parseInt(subtitleSelect.value);
                const tracks = videoPlayer.textTracks;
                for (let i = 0; i < tracks.length; i++) {
                    tracks[i].mode = i === idx ? 'showing' : 'hidden';
                }
            };
        }

        data.subtitles.forEach((sub, i) => {
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = sub.language;
            track.srclang = sub.language;
            track.src = `/api/subtitle/file?path=${encodeURIComponent(sub.path)}`;
            if (i === 0) track.default = true;
            videoPlayer.appendChild(track);
        });

        let subtitlesVisible = false;
        if (subtitleBtn) {
            subtitleBtn.onclick = () => {
                subtitlesVisible = !subtitlesVisible;
                const tracks = videoPlayer.textTracks;
                for (let i = 0; i < tracks.length; i++) {
                    tracks[i].mode = subtitlesVisible ? (i === 0 ? 'showing' : 'hidden') : 'hidden';
                }
                subtitleBtn.classList.toggle('active', subtitlesVisible);
            };
        }
    } catch (e) { console.error('Subtitles error:', e); }
}

async function loadPlayerTags(videoPath) {
    if (!playerTagsContainer) return;
    try {
        const res = await fetch(`/api/video/tags?video_path=${encodeURIComponent(videoPath)}`, { credentials: 'same-origin' });
        const data = await res.json();
        playerTagsContainer.innerHTML = data.tags.map(t =>
            `<span class="tag-chip"  style="background:${t.color}">${escapeHtml(t.name)}</span>`
        ).join('') + `<span class="tag-chip tag-chip-removable" style="background:rgba(255,255,255,0.2);cursor:pointer;" id="add-tag-to-video">+ Tag</span>`;
        document.getElementById('add-tag-to-video').onclick = () => showAddTagToVideo(videoPath);
    } catch (e) { playerTagsContainer.innerHTML = ''; }
}

async function showAddTagToVideo(videoPath) {
    await loadAllTags();
    const existingRes = await fetch(`/api/video/tags?video_path=${encodeURIComponent(videoPath)}`, { credentials: 'same-origin' });
    const existingData = await existingRes.json();
    const existingIds = new Set(existingData.tags.map(t => t.id));

    const available = allTags.filter(t => !existingIds.has(t.id));
    if (available.length === 0) { alert('All tags already applied. Create more in Tags Manager.'); return; }

    const tagId = await new Promise(resolve => {
        const modal = document.getElementById('batch-tag-modal');
        const list = document.getElementById('batch-tag-list');
        list.innerHTML = available.map(t =>
            `<div class="album-select-item" data-id="${t.id}"><span class="tag-chip" style="background:${t.color}">${escapeHtml(t.name)}</span></div>`
        ).join('');
        modal.style.display = 'flex';
        list.querySelectorAll('.album-select-item').forEach(el => {
            el.onclick = () => { modal.style.display = 'none'; resolve(parseInt(el.dataset.id)); };
        });
        document.getElementById('batch-tag-cancel').onclick = () => { modal.style.display = 'none'; resolve(null); };
    });

    if (tagId) {
        await fetch('/api/video/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ video_path: videoPath, tag_id: tagId }) });
        loadPlayerTags(videoPath);
        refreshDisplay();
    }
}
```

- [ ] **Step 4: Add video queue functions**

```javascript
// ===== VIDEO QUEUE =====

function saveQueue() {
    sessionStorage.setItem('videoQueue', JSON.stringify(videoQueue));
}

function addToQueue(file) {
    if (!videoQueue.find(q => q.path === file.path)) {
        videoQueue.push({ name: file.name, path: file.path, type: file.type || 'video' });
        saveQueue();
        renderQueue();
        statusMessage.textContent = `Added to queue: ${file.name}`;
    }
}

function playAll() {
    const videos = currentMediaList.filter(f => f.type === 'video' || !f.type);
    videoQueue = videos.map(f => ({ name: f.name, path: f.path, type: 'video' }));
    queueIndex = 0;
    saveQueue();
    renderQueue();
    if (videoQueue.length > 0) playVideo(videoQueue[0].path, videoQueue[0].name);
}

function addAllToQueue() {
    const videos = currentMediaList.filter(f => f.type === 'video' || !f.type);
    let added = 0;
    for (const f of videos) {
        if (!videoQueue.find(q => q.path === f.path)) {
            videoQueue.push({ name: f.name, path: f.path, type: 'video' });
            added++;
        }
    }
    saveQueue();
    renderQueue();
    statusMessage.textContent = `Added ${added} videos to queue`;
}

function renderQueue() {
    const queueList = document.getElementById('queue-list');
    if (!queueList) return;
    queueList.innerHTML = videoQueue.map((item, i) =>
        `<div class="queue-item ${i === queueIndex ? 'playing' : ''}" draggable="true" data-index="${i}">
            <span>${escapeHtml(item.name)}</span>
            <span class="queue-remove" data-index="${i}">&times;</span>
        </div>`
    ).join('') || '<div class="empty-state" style="padding:20px;">Queue is empty</div>';

    queueList.querySelectorAll('.queue-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            videoQueue.splice(idx, 1);
            if (queueIndex >= idx && queueIndex > 0) queueIndex--;
            saveQueue();
            renderQueue();
        });
    });

    queueList.querySelectorAll('.queue-item').forEach(item => {
        item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.index);
            queueIndex = idx;
            playVideo(videoQueue[idx].path, videoQueue[idx].name);
        });

        item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', item.dataset.index); });
        item.addEventListener('dragover', (e) => e.preventDefault());
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
            const toIdx = parseInt(item.dataset.index);
            const [moved] = videoQueue.splice(fromIdx, 1);
            videoQueue.splice(toIdx, 0, moved);
            saveQueue();
            renderQueue();
        });
    });
}

function updateQueueHighlight() {
    const idx = videoQueue.findIndex(q => q.path === currentVideoPath);
    if (idx >= 0) queueIndex = idx;
    renderQueue();
}

function setupAutoAdvance() {
    videoPlayer.addEventListener('ended', () => {
        if (videoQueue.length > 0 && queueIndex < videoQueue.length - 1) {
            showAutoplayCountdown();
        }
    });
}

function showAutoplayCountdown() {
    const countdown = document.getElementById('autoplay-countdown');
    const titleEl = document.getElementById('countdown-title');
    const secondsEl = document.getElementById('countdown-seconds');
    const cancelBtn = document.getElementById('countdown-cancel');

    const nextIdx = queueIndex + 1;
    if (nextIdx >= videoQueue.length) return;

    titleEl.textContent = videoQueue[nextIdx].name;
    let seconds = 3;
    secondsEl.textContent = seconds;
    countdown.style.display = 'block';

    autoplayTimer = setInterval(() => {
        seconds--;
        secondsEl.textContent = seconds;
        if (seconds <= 0) {
            clearInterval(autoplayTimer);
            countdown.style.display = 'none';
            queueIndex = nextIdx;
            playVideo(videoQueue[nextIdx].path, videoQueue[nextIdx].name);
        }
    }, 1000);

    cancelBtn.onclick = () => {
        clearInterval(autoplayTimer);
        countdown.style.display = 'none';
    };
}

// Init queue toggle
(function initQueueControls() {
    const queueToggle = document.getElementById('queue-toggle-btn');
    const queuePanel = document.getElementById('queue-panel');
    const queueShuffleBtn = document.getElementById('queue-shuffle-btn');
    const queueClearBtn = document.getElementById('queue-clear-btn');

    if (queueToggle && queuePanel) {
        queueToggle.addEventListener('click', () => {
            queuePanel.style.display = queuePanel.style.display === 'none' ? 'flex' : 'none';
        });
    }
    if (queueShuffleBtn) {
        queueShuffleBtn.addEventListener('click', () => {
            for (let i = videoQueue.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [videoQueue[i], videoQueue[j]] = [videoQueue[j], videoQueue[i]];
            }
            saveQueue();
            renderQueue();
        });
    }
    if (queueClearBtn) {
        queueClearBtn.addEventListener('click', () => {
            videoQueue = [];
            queueIndex = -1;
            saveQueue();
            renderQueue();
        });
    }
})();

setupAutoAdvance();
```

- [ ] **Step 5: Add Picture-in-Picture function**

```javascript
// ===== PICTURE-IN-PICTURE =====

(function initPiP() {
    const pipBtn = document.getElementById('pip-btn');
    if (!pipBtn) return;

    if (!document.pictureInPictureEnabled) {
        pipBtn.style.display = 'none';
        return;
    }

    pipBtn.addEventListener('click', async () => {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await videoPlayer.requestPictureInPicture();
            }
        } catch (e) {
            console.error('PiP error:', e);
            statusMessage.textContent = 'Picture-in-Picture not available';
        }
    });

    videoPlayer.addEventListener('enterpictureinpicture', () => {
        pipBtn.classList.add('active');
        statusMessage.textContent = 'Picture-in-Picture active';
    });
    videoPlayer.addEventListener('leavepictureinpicture', () => {
        pipBtn.classList.remove('active');
        statusMessage.textContent = 'Ready';
    });
})();
```

- [ ] **Step 6: Add trash view functions**

```javascript
// ===== TRASH VIEW =====

async function updateTrashBadge() {
    try {
        const res = await fetch('/api/trash', { credentials: 'same-origin' });
        if (res.ok) {
            const data = await res.json();
            if (trashBadge) {
                trashBadge.textContent = data.items.length;
                trashBadge.style.display = data.items.length > 0 ? 'inline' : 'none';
            }
        }
    } catch (e) { /* ignore */ }
}

async function showTrash() {
    document.getElementById('trash-modal').style.display = 'flex';
    document.getElementById('trash-modal-close').onclick = () => document.getElementById('trash-modal').style.display = 'none';

    try {
        const res = await fetch('/api/trash', { credentials: 'same-origin' });
        const data = await res.json();
        const trashList = document.getElementById('trash-list');

        if (data.items.length === 0) {
            trashList.innerHTML = '<div class="empty-state">Trash is empty</div>';
            return;
        }

        trashList.innerHTML = data.items.map(item => `
            <div class="trash-item" data-id="${item.id}">
                <div class="trash-item-info">
                    <div class="trash-item-name">${escapeHtml(item.original_name)}</div>
                    <div class="trash-item-meta">From: ${escapeHtml(item.original_path)} | ${formatFileSize(item.size || 0)} | Deleted: ${formatDate(item.deleted_at)}</div>
                </div>
                <div class="trash-item-actions">
                    <button class="btn-secondary btn-sm trash-restore" data-id="${item.id}">Restore</button>
                    <button class="btn-delete btn-sm trash-delete" data-id="${item.id}">Delete</button>
                </div>
            </div>
        `).join('');

        trashList.querySelectorAll('.trash-restore').forEach(btn => {
            btn.addEventListener('click', async () => {
                await fetch('/api/trash/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ id: parseInt(btn.dataset.id) }) });
                showTrash();
                updateTrashBadge();
                loadDirectory(currentPath);
            });
        });
        trashList.querySelectorAll('.trash-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Permanently delete this file?')) return;
                await fetch(`/api/trash/${btn.dataset.id}`, { method: 'DELETE', credentials: 'same-origin' });
                showTrash();
                updateTrashBadge();
            });
        });
    } catch (e) { console.error('Trash load error:', e); }

    document.getElementById('empty-trash-btn').onclick = async () => {
        if (!confirm('Permanently delete all trash items? This cannot be undone.')) return;
        await fetch('/api/trash/empty', { method: 'POST', credentials: 'same-origin' });
        showTrash();
        updateTrashBadge();
    };
}
```

- [ ] **Step 7: Add undo toast for delete operations**

Modify the existing `deleteCurrentVideo()` and `deleteSelectedFiles()` functions. After a successful delete, show the undo toast. After `closeVideoPlayer();` in `deleteCurrentVideo()`, add:

```javascript
            showUndoToast(data.lastTrashId);
```

Similarly in `deleteSelectedFiles()` after the success block, add:

```javascript
            showUndoToast(data.lastTrashId);
```

Add the `showUndoToast` function:

```javascript
function showUndoToast(trashId) {
    if (!trashId) return;
    const toast = document.getElementById('undo-toast');
    toast.style.display = 'flex';
    const timeout = setTimeout(() => { toast.style.display = 'none'; }, 5000);
    document.getElementById('undo-restore-btn').onclick = async () => {
        clearTimeout(timeout);
        toast.style.display = 'none';
        await fetch('/api/trash/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ id: trashId }) });
        updateTrashBadge();
        if (isSearchMode) performSearch(searchInput.value); else loadDirectory(currentPath);
        statusMessage.textContent = 'File restored from trash';
    };
}
```

Also update `updateTrashBadge()` calls after delete operations.

- [ ] **Step 8: Add batch operation functions**

```javascript
// ===== BATCH OPERATIONS =====

async function showFolderPicker() {
    if (selectedFiles.size === 0) { alert('Select files first'); return; }
    const modal = document.getElementById('folder-picker-modal');
    modal.style.display = 'flex';
    document.getElementById('folder-pick-cancel').onclick = () => modal.style.display = 'none';

    let selectedFolder = '';
    const tree = document.getElementById('folder-tree');

    async function loadFolderTree(parentPath = '') {
        const res = await fetch(`/api/browse?path=${encodeURIComponent(parentPath)}`, { credentials: 'same-origin' });
        const data = await res.json();
        return data.folders || [];
    }

    async function renderTree() {
        const folders = await loadFolderTree('');
        tree.innerHTML = `<div class="folder-tree-item ${selectedFolder === '' ? 'selected' : ''}" data-path="">📁 Root</div>` +
            folders.map(f => `<div class="folder-tree-item ${selectedFolder === f.path ? 'selected' : ''}" data-path="${escapeHtml(f.path)}">📁 ${escapeHtml(f.name)}</div>`).join('');
        tree.querySelectorAll('.folder-tree-item').forEach(el => {
            el.addEventListener('click', () => {
                selectedFolder = el.dataset.path;
                tree.querySelectorAll('.folder-tree-item').forEach(e => e.classList.remove('selected'));
                el.classList.add('selected');
            });
        });
    }

    await renderTree();

    document.getElementById('folder-pick-confirm').onclick = async () => {
        modal.style.display = 'none';
        const res = await fetch('/api/video/move', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ paths: Array.from(selectedFiles), destination: selectedFolder })
        });
        const data = await res.json();
        statusMessage.textContent = `Moved ${data.moved} files`;
        selectedFiles.clear();
        selectionMode = false;
        updateSelectionUI();
        loadDirectory(currentPath);
    };
}

async function showBatchTagModal() {
    if (selectedFiles.size === 0) { alert('Select files first'); return; }
    await loadAllTags();
    const modal = document.getElementById('batch-tag-modal');
    const list = document.getElementById('batch-tag-list');
    list.innerHTML = allTags.map(t =>
        `<div class="album-select-item" data-id="${t.id}"><span class="tag-chip" style="background:${t.color}">${escapeHtml(t.name)}</span></div>`
    ).join('') || '<div class="empty-state">No tags. Create tags in Tags Manager first.</div>';
    modal.style.display = 'flex';
    list.querySelectorAll('.album-select-item').forEach(el => {
        el.onclick = async () => {
            modal.style.display = 'none';
            await fetch('/api/video/batch-tag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ paths: Array.from(selectedFiles), tag_id: parseInt(el.dataset.id) }) });
            statusMessage.textContent = `Tagged ${selectedFiles.size} files`;
            loadDirectory(currentPath);
        };
    });
    document.getElementById('batch-tag-cancel').onclick = () => modal.style.display = 'none';
}

function showBatchRateModal() {
    if (selectedFiles.size === 0) { alert('Select files first'); return; }
    const modal = document.getElementById('batch-rate-modal');
    modal.style.display = 'flex';
    const stars = modal.querySelectorAll('.batch-star');
    stars.forEach(star => {
        star.addEventListener('mouseover', () => {
            const val = parseInt(star.dataset.value);
            stars.forEach(s => s.classList.toggle('hovered', parseInt(s.dataset.value) <= val));
        });
        star.addEventListener('mouseout', () => stars.forEach(s => s.classList.remove('hovered')));
        star.addEventListener('click', async () => {
            modal.style.display = 'none';
            await fetch('/api/video/batch-rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ paths: Array.from(selectedFiles), rating: parseInt(star.dataset.value) }) });
            statusMessage.textContent = `Rated ${selectedFiles.size} files`;
            loadDirectory(currentPath);
        });
    });
    document.getElementById('batch-rate-cancel').onclick = () => modal.style.display = 'none';
}

async function batchToggleFavorite() {
    if (selectedFiles.size === 0) { alert('Select files first'); return; }
    const res = await fetch('/api/video/batch-favorite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ paths: Array.from(selectedFiles) }) });
    const data = await res.json();
    statusMessage.textContent = `${data.added} favorited, ${data.removed} unfavorited`;
    await loadFavorites();
    loadDirectory(currentPath);
}
```

- [ ] **Step 9: Add stats and duplicate detection functions**

```javascript
// ===== STATS & DUPLICATES =====

async function showStats() {
    document.getElementById('stats-modal').style.display = 'flex';
    document.getElementById('stats-modal-close').onclick = () => document.getElementById('stats-modal').style.display = 'none';

    try {
        const res = await fetch('/api/stats', { credentials: 'same-origin' });
        const stats = await res.json();

        document.getElementById('stats-summary').innerHTML = `
            <div class="stat-card"><div class="stat-value">${stats.totalFiles}</div><div class="stat-label">Total Files</div></div>
            <div class="stat-card"><div class="stat-value">${formatFileSize(stats.totalSize)}</div><div class="stat-label">Total Size</div></div>
            <div class="stat-card"><div class="stat-value">${stats.trashCount}</div><div class="stat-label">In Trash</div></div>
            <div class="stat-card"><div class="stat-value">${formatFileSize(stats.trashSize)}</div><div class="stat-label">Trash Size</div></div>
        `;

        const maxTypeSize = Math.max(...Object.values(stats.byType).map(t => t.size), 1);
        document.getElementById('stats-types').innerHTML = Object.entries(stats.byType)
            .sort((a, b) => b[1].size - a[1].size)
            .map(([type, data]) => `
                <div class="stats-bar-row">
                    <span class="stats-bar-label">${type}</span>
                    <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${(data.size / maxTypeSize * 100).toFixed(1)}%"></div></div>
                    <span class="stats-bar-value">${data.count} files (${formatFileSize(data.size)})</span>
                </div>
            `).join('');

        document.getElementById('stats-folders').innerHTML = stats.topFolders
            .map(f => `<div class="trash-item"><div class="trash-item-info"><div class="trash-item-name">📁 ${escapeHtml(f.name)}</div><div class="trash-item-meta">${f.count} files, ${formatFileSize(f.size)}</div></div></div>`).join('');

        document.getElementById('stats-files').innerHTML = stats.topFiles
            .map(f => `<div class="trash-item"><div class="trash-item-info"><div class="trash-item-name">${escapeHtml(f.name)}</div><div class="trash-item-meta">${escapeHtml(f.path)} | ${formatFileSize(f.size)}</div></div></div>`).join('');

        document.getElementById('stats-formats').innerHTML = Object.entries(stats.byExtension)
            .sort((a, b) => b[1] - a[1])
            .map(([ext, count]) => `<span class="tag-chip" style="background:rgba(102,126,234,0.3)">${ext} (${count})</span>`)
            .join(' ');

    } catch (e) { console.error('Stats error:', e); }

    document.getElementById('find-duplicates-btn').onclick = async () => {
        const resultsDiv = document.getElementById('duplicates-results');
        resultsDiv.innerHTML = '<div class="loading">Scanning for duplicates...</div>';
        try {
            const res = await fetch('/api/duplicates', { credentials: 'same-origin' });
            const data = await res.json();
            if (data.groups.length === 0) {
                resultsDiv.innerHTML = '<div class="empty-state">No duplicates found</div>';
                return;
            }
            resultsDiv.innerHTML = `<p>Found ${data.totalGroups} potential duplicate groups:</p>` +
                data.groups.map(group => `
                    <div class="duplicate-group">
                        <div class="duplicate-group-header">${escapeHtml(group.type)}: ${escapeHtml(group.criterion)}</div>
                        ${group.files.map(f => `
                            <div class="duplicate-file">
                                <div><strong>${escapeHtml(f.name)}</strong><br><span style="color:#888;font-size:0.8em">${escapeHtml(f.path)} | ${formatFileSize(f.size)}</span></div>
                                <button class="btn-delete btn-sm dup-delete" data-path="${escapeHtml(f.path)}">Delete</button>
                            </div>
                        `).join('')}
                    </div>
                `).join('');

            resultsDiv.querySelectorAll('.dup-delete').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm(`Delete ${btn.dataset.path}?`)) return;
                    await fetch('/api/video', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ path: btn.dataset.path }) });
                    updateTrashBadge();
                    document.getElementById('find-duplicates-btn').click();
                });
            });
        } catch (e) {
            resultsDiv.innerHTML = '<div class="error">Failed to scan for duplicates</div>';
        }
    };
}
```

- [ ] **Step 10: Add "Add to Queue" button in video card click handlers**

In `displayVideos()`, modify the non-selection-mode click handler for video items. Add a right-click (context menu) handler for "Add to Queue":

After the existing click handler block for `.video-item` elements (around the `document.querySelectorAll('.video-item').forEach` block), add:

```javascript
    // Right-click to add to queue
    document.querySelectorAll('.video-item').forEach(item => {
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const path = item.dataset.path;
            const name = item.querySelector('.video-name').textContent;
            const type = item.dataset.type;
            if (type === 'video' || !type) {
                addToQueue({ name, path, type: 'video' });
            }
        });
    });
```

- [ ] **Step 11: Test the full feature set manually**

1. Start the server, log in
2. Test tags: create tags in Tags Manager, apply to videos, filter by tag
3. Test favorites: click hearts, filter favorites only
4. Test sort: change sort dropdown, verify order changes
5. Test resume: play a video, pause midway, close, reopen - should show resume toast
6. Test queue: right-click videos to add to queue, open queue panel, verify auto-advance
7. Test PiP: click PiP button during playback
8. Test trash: delete a file, check trash view, restore it
9. Test batch operations: select multiple files, batch tag/rate/move
10. Test stats: view stats dashboard
11. Test duplicates: click Find Duplicates button

- [ ] **Step 12: Commit**

```bash
git add public/app.js
git commit -m "feat: add resume playback, subtitles, queue, PiP, trash view, batch ops, stats, and duplicates UI"
```

---

### Task 11: Integration Testing & Final Polish

**Files:**
- Potentially touch all 4 files for bug fixes found during testing

**Interfaces:**
- Consumes: All previous tasks

- [ ] **Step 1: Full integration test**

Start the server, log in, and test every feature end-to-end:

1. Browse folders - verify tags, favorites, progress bars show on video cards
2. Search - verify results include new fields
3. Sort - all 8 sort options work
4. Filters - combine multiple filters (favorites + tag + unseen)
5. Tags Manager - create, delete tags
6. Apply/remove tags on individual videos from the player
7. Batch tag/rate/favorite/move - select multiple files, test each action
8. Delete file - verify it goes to trash, not permanent delete
9. Trash view - list, restore, permanent delete, empty trash
10. Undo toast - appears after delete, click undo restores file
11. Resume playback - play video, pause, close, reopen
12. Subtitles - place a `.srt` file next to a video, verify CC button appears
13. Queue - add videos, reorder, shuffle, clear, auto-advance
14. Picture-in-Picture - verify PiP works
15. Stats dashboard - summary cards, bar charts, format distribution
16. Find Duplicates - verify duplicate groups appear
17. Dark/Light theme - verify all new components render correctly in both themes
18. Mobile responsive - resize browser, verify layout adapts

- [ ] **Step 2: Fix any issues found**

Address any bugs or visual issues discovered during testing.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: integration testing and polish for advanced features"
```
