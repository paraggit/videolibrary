const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');

// Load configuration
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Setup thumbnails directory
const thumbnailsDir = path.join(config.videoDirectory, '.thumbnails');
if (config.enableThumbnails && !fs.existsSync(thumbnailsDir)) {
  fs.mkdirSync(thumbnailsDir, { recursive: true });
}

// Setup trash directory
const trashDir = path.join(config.videoDirectory, '.trash');
if (!fs.existsSync(trashDir)) {
  fs.mkdirSync(trashDir, { recursive: true });
}

const app = express();
const PORT = config.port || 3000;
const HOST = config.host || '127.0.0.1';

// Determine database path, fallback to local directory if configured videoDirectory is inaccessible
let dbPath;
try {
  // Ensure the video directory exists
  if (!fs.existsSync(config.videoDirectory)) {
    fs.mkdirSync(config.videoDirectory, { recursive: true });
  }
  dbPath = path.join(config.videoDirectory, 'videolibrary.db');
} catch (error) {
  console.warn(`\u26A0\uFE0F Could not access or create videoDirectory at ${config.videoDirectory}. Falling back to local directory for database.`);
  dbPath = path.join(__dirname, 'videolibrary.db');
}

// Initialize SQLite database
const db = new Database(dbPath);


// Create database schema
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      cover_image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS album_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_id INTEGER NOT NULL,
      video_path TEXT NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
      UNIQUE(album_id, video_path)
    );
    
    CREATE TABLE IF NOT EXISTS video_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_path TEXT NOT NULL UNIQUE,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS video_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_path TEXT NOT NULL UNIQUE,
      last_watched DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_album_videos_album_id ON album_videos(album_id);
    CREATE INDEX IF NOT EXISTS idx_album_videos_video_path ON album_videos(video_path);
    CREATE INDEX IF NOT EXISTS idx_video_ratings_video_path ON video_ratings(video_path);
    CREATE INDEX IF NOT EXISTS idx_video_history_video_path ON video_history(video_path);

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
  `);

  console.log('✅ Database initialized:', dbPath);
}

initializeDatabase();

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

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware (cookie-based, in-memory storage)
app.use(session({
  secret: crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.https && config.https.enabled, // Secure cookies when HTTPS is enabled
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  },
  name: 'video.sid' // Custom session cookie name
}));


// Network isolation middleware - Block all non-local requests
app.use((req, res, next) => {
  const host = req.get('host');
  const allowedHosts = ['127.0.0.1', 'localhost'];

  // Extract hostname without port
  const hostname = host ? host.split(':')[0] : '';

  if (!allowedHosts.includes(hostname)) {
    console.warn(`⚠️  SECURITY: Blocked request from unauthorized host: ${host} (IP: ${req.ip})`);
    return res.status(403).json({
      error: 'Access denied',
      message: 'This application only accepts local connections for privacy protection'
    });
  }

  next();
});

// Enhanced security headers for complete privacy
app.use((req, res, next) => {
  // Strict Content Security Policy - Block ALL external resources
  res.setHeader('Content-Security-Policy',
    "default-src 'none'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "media-src 'self' blob:; " +
    "connect-src 'self'; " +
    "img-src 'self' data:; " +
    "font-src 'self'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "frame-ancestors 'none'; " +
    "upgrade-insecure-requests"
  );

  // Prevent content type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent embedding in frames
  res.setHeader('X-Frame-Options', 'DENY');

  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Privacy: Never send referrer information
  res.setHeader('Referrer-Policy', 'no-referrer');

  // Disable browser features that could leak data
  res.setHeader('Permissions-Policy',
    'geolocation=(), ' +
    'microphone=(), ' +
    'camera=(), ' +
    'payment=(), ' +
    'usb=(), ' +
    'magnetometer=(), ' +
    'gyroscope=(), ' +
    'accelerometer=()'
  );

  // Prevent DNS prefetching to external domains
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  // Prevent download of external resources
  res.setHeader('X-Download-Options', 'noopen');

  // Prevent MIME type sniffing
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  next();
});

// Privacy audit logging (optional, only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
    next();
  });
}


// Authentication middleware
function requireAuth(req, res, next) {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// Sanitize path to prevent directory traversal attacks
function sanitizePath(userPath) {
  // Normalize the base directory once
  const baseDir = path.resolve(config.videoDirectory);

  // Handle empty path (root directory)
  if (!userPath || userPath === '') {
    return baseDir;
  }

  // Remove any attempts to traverse up directories
  const normalized = path.normalize(userPath).replace(/^(\.\.(\/|\\|$))+/, '');

  // Resolve the full path (this handles all edge cases with path joining)
  const fullPath = path.resolve(baseDir, normalized);

  // Ensure the resolved path is within the video directory
  // Use path.resolve to ensure both paths are absolute and normalized
  if (!fullPath.startsWith(baseDir + path.sep) && fullPath !== baseDir) {
    throw new Error('Invalid path: directory traversal detected');
  }

  return fullPath;
}

// Check if file is a video
function isVideoFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return config.allowedExtensions.includes(ext);
}

// Check if file is an image
function isImageFile(filename) {
  const imageExts = config.allowedImageExtensions || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const ext = path.extname(filename).toLowerCase();
  return imageExts.includes(ext);
}

// Check if file is any supported media type
function isMediaFile() {
  // Accept all files now, not just video and image
  return true;
}

// Get file type
function getFileType(filename) {
  if (isVideoFile(filename)) return 'video';
  if (isImageFile(filename)) return 'image';

  // Determine type based on extension for other files
  const ext = path.extname(filename).toLowerCase();

  // Document types
  if (['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'].includes(ext)) return 'document';

  // Audio types
  if (['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'].includes(ext)) return 'audio';

  // Archive types
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'].includes(ext)) return 'archive';

  // Code types
  if (['.js', '.py', '.java', '.cpp', '.c', '.html', '.css', '.json', '.xml'].includes(ext)) return 'code';

  return 'file';
}
// Get MIME type based on file extension
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg'
  };
  return mimeTypes[ext] || 'video/mp4'; // Default to mp4 if unknown
}

// Recursively read directory structure with depth limit
async function readDirectoryRecursive(dirPath, currentDepth = 0) {
  if (currentDepth > config.maxRecursionDepth) {
    return { error: 'Maximum recursion depth exceeded' };
  }

  try {
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const result = {
      folders: [],
      files: []
    };

    // Pre-fetch all ratings into memory
    const ratingsList = db.prepare('SELECT video_path, rating FROM video_ratings').all();
    const ratingsMap = new Map();
    for (const r of ratingsList) {
      ratingsMap.set(r.video_path, r.rating);
    }

    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      const relativePath = path.relative(config.videoDirectory, itemPath);

      // Skip hidden files and folders
      if (item.name.startsWith('.')) {
        continue;
      }

      if (item.isDirectory()) {
        result.folders.push({
          name: item.name,
          path: relativePath
        });
      } else if (item.isFile() && isMediaFile(item.name)) {
        const stats = await fs.promises.stat(itemPath);
        result.files.push({
          name: item.name,
          path: relativePath,
          type: getFileType(item.name),
          size: stats.size,
          modified: stats.mtime,
          rating: ratingsMap.get(relativePath) || 0
        });
      }
    }

    return result;
  } catch (error) {
    throw new Error(`Failed to read directory: ${error.message}`);
  }
}

// Serve static files from public directory
app.use(express.static('public'));

// Login endpoint
app.post('/api/login', (req, res) => {
  const { password } = req.body;

  if (password === config.password) {
    req.session.authenticated = true;
    req.session.loginTime = Date.now();

    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Logout endpoint
app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('video.sid');
    res.json({ success: true });
  });
});

// API to get rating for a video
app.get('/api/rating', requireAuth, (req, res) => {
  try {
    const { video_path } = req.query;
    if (!video_path) {
      return res.status(400).json({ error: 'video_path parameter required' });
    }
    const row = db.prepare('SELECT rating FROM video_ratings WHERE video_path = ?').get(video_path);
    res.json({ rating: row ? row.rating : 0 });
  } catch (error) {
    console.error('Get rating error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API to set rating for a video
app.post('/api/rating', requireAuth, (req, res) => {
  try {
    const { video_path, rating } = req.body;
    if (!video_path || rating === undefined) {
      return res.status(400).json({ error: 'video_path and rating are required' });
    }

    const parsedRating = parseInt(rating, 10);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
    }

    db.prepare(`
      INSERT INTO video_ratings (video_path, rating, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(video_path) DO UPDATE SET rating = ?, updated_at = CURRENT_TIMESTAMP
    `).run(video_path, parsedRating, parsedRating);

    res.json({ success: true, rating: parsedRating });
  } catch (error) {
    console.error('Set rating error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API to record watched history
app.post('/api/history', requireAuth, (req, res) => {
  try {
    const { video_path } = req.body;
    if (!video_path) {
      return res.status(400).json({ error: 'video_path parameter required' });
    }
    db.prepare(`
      INSERT INTO video_history (video_path, last_watched) 
      VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT(video_path) DO UPDATE SET last_watched = CURRENT_TIMESTAMP
    `).run(video_path);
    res.json({ success: true });
  } catch (error) {
    console.error('History API error:', error.message);
    res.status(500).json({ error: error.message });
  }
});


// Get directory contents
app.get('/api/browse', requireAuth, async (req, res) => {
  try {
    const requestedPath = req.query.path || '';
    const fullPath = sanitizePath(requestedPath);

    // Check if path exists and is a directory
    const stats = await fs.promises.stat(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const contents = await readDirectoryRecursive(fullPath);
    contents.thumbnailsEnabled = !!config.enableThumbnails;
    res.json(contents);
  } catch (error) {
    console.error('Browse error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Recursive search for videos
async function searchVideosRecursive(startPath, query, ratingFilter = '0', maxResults = 100) {
  const results = [];
  const lowerQuery = query.toLowerCase();

  // Pre-fetch all ratings into memory
  const ratingsList = db.prepare('SELECT video_path, rating FROM video_ratings').all();
  const ratingsMap = new Map();
  for (const r of ratingsList) {
    ratingsMap.set(r.video_path, r.rating);
  }

  // Pre-fetch seen history
  const historyList = db.prepare('SELECT video_path FROM video_history').all();
  const seenSet = new Set(historyList.map(h => h.video_path));

  async function searchDir(dirPath, depth = 0) {
    if (depth > config.maxRecursionDepth || results.length >= maxResults) {
      return;
    }

    try {
      const items = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        // Skip hidden files and folders
        if (item.name.startsWith('.')) {
          continue;
        }

        const itemPath = path.join(dirPath, item.name);
        const relativePath = path.relative(config.videoDirectory, itemPath);

        if (item.isDirectory()) {
          await searchDir(itemPath, depth + 1);
        } else if (item.isFile() && isMediaFile(item.name)) {
          if (item.name.toLowerCase().includes(lowerQuery)) {
            // Apply rating/seen filter
            const rating = ratingsMap.get(relativePath) || 0;
            const isSeen = seenSet.has(relativePath);

            if (ratingFilter === 'seen') {
              if (!isSeen) continue;
            } else {
              const exactRating = parseInt(ratingFilter, 10);
              if (exactRating > 0 && rating !== exactRating) {
                continue;
              }
            }

            const stats = await fs.promises.stat(itemPath);
            results.push({
              name: item.name,
              path: relativePath,
              folder: path.dirname(relativePath) || 'Home',
              type: getFileType(item.name),
              size: stats.size,
              modified: stats.mtime,
              rating: rating,
              seen: isSeen
            });
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.error(`Error reading directory ${dirPath}:`, error.message);
    }
  }

  await searchDir(startPath);
  return results;
}

// Search endpoint
app.get('/api/search', requireAuth, async (req, res) => {
  try {
    const query = req.query.q || '';
    const startPath = req.query.path || '';
    const ratingFilter = req.query.ratingFilter || '0';

    // Require at least 2 characters for search, unless a rating filter is applied
    if ((!query || query.length < 2) && ratingFilter === '0') {
      return res.json({ results: [], count: 0 });
    }

    const fullPath = sanitizePath(startPath);
    const results = await searchVideosRecursive(fullPath, query, ratingFilter);

    res.json({ results, count: results.length, thumbnailsEnabled: !!config.enableThumbnails });
  } catch (error) {
    console.error('Stream error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Serve image files
app.get('/api/image', requireAuth, async (req, res) => {
  try {
    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path parameter required' });
    }

    const fullPath = sanitizePath(requestedPath);

    if (!isImageFile(fullPath)) {
      return res.status(400).json({ error: 'Not an image file' });
    }

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Send image file
    res.sendFile(fullPath);

  } catch (error) {
    console.error('Image serve error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Generate and serve video thumbnails
app.get('/api/thumbnail', requireAuth, async (req, res) => {
  if (!config.enableThumbnails) {
    return res.status(403).json({ error: 'Thumbnails are disabled' });
  }

  try {
    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path parameter required' });
    }

    const fullPath = sanitizePath(requestedPath);
    if (!fs.existsSync(fullPath) || !isVideoFile(fullPath)) {
      return res.status(404).json({ error: 'Valid video file not found' });
    }

    // Use hash to avoid invalid filename characters
    const hash = crypto.createHash('md5').update(requestedPath).digest('hex');
    const thumbnailPath = path.join(thumbnailsDir, `${hash}.jpg`);

    if (fs.existsSync(thumbnailPath)) {
      return res.sendFile(thumbnailPath);
    }

    // Generate thumbnail locally without sending data to external networks
    exec(`ffmpeg -i "${fullPath}" -ss 00:00:05.000 -vframes 1 "${thumbnailPath}" -y`, (error) => {
      if (error) {
        // Fallback to 1 second if video is short
        exec(`ffmpeg -i "${fullPath}" -ss 00:00:01.000 -vframes 1 "${thumbnailPath}" -y`, (err2) => {
          if (err2 || !fs.existsSync(thumbnailPath)) {
            console.error('Thumbnail generation failed for:', requestedPath);
            return res.status(500).json({ error: 'Failed to generate thumbnail' });
          }
          res.sendFile(thumbnailPath);
        });
      } else {
        if (fs.existsSync(thumbnailPath)) {
          res.sendFile(thumbnailPath);
        } else {
          res.status(500).json({ error: 'Failed to generate thumbnail' });
        }
      }
    });

  } catch (error) {
    console.error('Thumbnail error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

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

// Rename video file
app.patch('/api/video/rename', requireAuth, async (req, res) => {
  try {
    const { path: oldPath, newName } = req.body;

    if (!oldPath || !newName) {
      return res.status(400).json({ error: 'Path and new name required' });
    }

    // Validate new name (no path separators, must have video extension)
    if (newName.includes('/') || newName.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    if (!isVideoFile(newName)) {
      return res.status(400).json({ error: 'New name must have a valid video extension' });
    }

    const oldFullPath = sanitizePath(oldPath);
    const directory = path.dirname(oldFullPath);
    const newFullPath = path.join(directory, newName);

    // Check if new file already exists
    if (fs.existsSync(newFullPath)) {
      return res.status(400).json({ error: 'A file with that name already exists' });
    }

    // Rename the file
    await fs.promises.rename(oldFullPath, newFullPath);

    // Update album associations
    const newRelativePath = path.relative(config.videoDirectory, newFullPath);
    db.prepare('UPDATE album_videos SET video_path = ? WHERE video_path = ?')
      .run(newRelativePath, oldPath);

    console.log(`Renamed: ${oldPath} -> ${newRelativePath}`);

    res.json({
      success: true,
      oldPath,
      newPath: newRelativePath
    });

  } catch (error) {
    console.error('Rename error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create folder
app.post('/api/folder', requireAuth, async (req, res) => {
  try {
    const { path: parentPath, name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Folder name required' });
    }

    // Validate folder name (no path separators)
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      return res.status(400).json({ error: 'Invalid folder name' });
    }

    // Build full path
    const basePath = parentPath ? sanitizePath(parentPath) : config.videoDirectory;
    const newFolderPath = path.join(basePath, name);

    // Check if folder already exists
    if (fs.existsSync(newFolderPath)) {
      return res.status(400).json({ error: 'Folder already exists' });
    }

    // Create the folder
    await fs.promises.mkdir(newFolderPath, { recursive: false });

    res.json({
      success: true,
      path: path.relative(config.videoDirectory, newFolderPath)
    });

  } catch (error) {
    console.error('Create folder error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Upload files
app.post('/api/upload', requireAuth, async (req, res) => {
  try {
    const contentType = req.headers['content-type'];

    if (!contentType || !contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Must be multipart/form-data' });
    }

    // Parse multipart form data manually
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({ error: 'No boundary found' });
    }

    let body = [];

    req.on('data', chunk => {
      body.push(chunk);
    });

    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(body);
        const parts = parseMultipartData(buffer, boundary);

        const folderPath = parts.fields.path || '';
        const files = parts.files || [];

        if (files.length === 0) {
          return res.status(400).json({ error: 'No files provided' });
        }

        const uploadDir = folderPath ? sanitizePath(folderPath) : config.videoDirectory;

        // Verify upload directory exists
        if (!fs.existsSync(uploadDir)) {
          return res.status(400).json({ error: 'Upload directory does not exist' });
        }

        const results = {
          uploaded: [],
          failed: []
        };

        for (const file of files) {
          try {
            const filePath = path.join(uploadDir, file.filename);

            // Write file
            await fs.promises.writeFile(filePath, file.data);

            results.uploaded.push(file.filename);
          } catch (err) {
            results.failed.push({ filename: file.filename, error: err.message });
          }
        }

        res.json({
          success: true,
          uploaded: results.uploaded.length,
          failed: results.failed.length,
          details: results
        });

      } catch (error) {
        console.error('Upload processing error:', error.message);
        res.status(500).json({ error: error.message });
      }
    });

  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to parse multipart form data
function parseMultipartData(buffer, boundary) {
  const parts = { fields: {}, files: [] };
  const boundaryStr = `--${boundary}`;
  const lines = buffer.toString('binary').split(boundaryStr);

  for (let i = 1; i < lines.length - 1; i++) {
    const part = lines[i];
    if (!part || part.trim() === '--') continue;

    const headerEndIndex = part.indexOf('\r\n\r\n');
    if (headerEndIndex === -1) continue;

    const headers = part.substring(0, headerEndIndex);
    const dataStart = headerEndIndex + 4;
    const dataEnd = part.lastIndexOf('\r\n');
    const data = part.substring(dataStart, dataEnd);

    const nameMatch = headers.match(/name="([^"]+)"/);
    if (!nameMatch) continue;

    const name = nameMatch[1];
    const filenameMatch = headers.match(/filename="([^"]+)"/);

    if (filenameMatch) {
      // This is a file
      const filename = filenameMatch[1];
      parts.files.push({
        filename: filename,
        data: Buffer.from(data, 'binary')
      });
    } else {
      // This is a field
      parts.fields[name] = data.trim();
    }
  }

  return parts;
}

// Get all albums
app.get('/api/albums', requireAuth, (req, res) => {
  try {
    const albums = db.prepare(`
      SELECT a.*, COUNT(av.id) as video_count
      FROM albums a
      LEFT JOIN album_videos av ON a.id = av.album_id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `).all();

    res.json({ albums });
  } catch (error) {
    console.error('Get albums error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get single album with videos
app.get('/api/albums/:id', requireAuth, async (req, res) => {
  try {
    const albumId = parseInt(req.params.id);

    const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId);
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const videoPaths = db.prepare('SELECT video_path FROM album_videos WHERE album_id = ?')
      .all(albumId)
      .map(row => row.video_path);

    // Get video metadata
    const videos = [];
    for (const videoPath of videoPaths) {
      try {
        const fullPath = sanitizePath(videoPath);
        const stats = await fs.promises.stat(fullPath);
        videos.push({
          name: path.basename(videoPath),
          path: videoPath,
          folder: path.dirname(videoPath) || 'Home',
          size: stats.size,
          modified: stats.mtime
        });
      } catch (error) {
        // Skip videos that no longer exist
        console.warn(`Video not found: ${videoPath}`);
      }
    }

    res.json({ album, videos });
  } catch (error) {
    console.error('Get album error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create album
app.post('/api/albums', requireAuth, (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Album name required' });
    }

    const result = db.prepare('INSERT INTO albums (name, description) VALUES (?, ?)')
      .run(name.trim(), description || '');

    const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(result.lastInsertRowid);

    console.log(`Created album: ${name}`);
    res.json({ success: true, album });

  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Album name already exists' });
    }
    console.error('Create album error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Update album
app.patch('/api/albums/:id', requireAuth, (req, res) => {
  try {
    const albumId = parseInt(req.params.id);
    const { name, description, cover_image } = req.body;

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (cover_image !== undefined) {
      updates.push('cover_image = ?');
      values.push(cover_image);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(albumId);

    db.prepare(`UPDATE albums SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(albumId);
    res.json({ success: true, album });

  } catch (error) {
    console.error('Update album error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Delete album
app.delete('/api/albums/:id', requireAuth, (req, res) => {
  try {
    const albumId = parseInt(req.params.id);

    db.prepare('DELETE FROM albums WHERE id = ?').run(albumId);

    console.log(`Deleted album: ${albumId}`);
    res.json({ success: true });

  } catch (error) {
    console.error('Delete album error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Add video to album
app.post('/api/albums/:id/videos', requireAuth, (req, res) => {
  try {
    const albumId = parseInt(req.params.id);
    const { video_path } = req.body;

    if (!video_path) {
      return res.status(400).json({ error: 'Video path required' });
    }

    // Verify video exists
    const fullPath = sanitizePath(video_path);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Video not found' });
    }

    db.prepare('INSERT INTO album_videos (album_id, video_path) VALUES (?, ?)')
      .run(albumId, video_path);

    res.json({ success: true });

  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Video already in album' });
    }
    console.error('Add video to album error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Remove video from album
app.delete('/api/albums/:id/videos', requireAuth, (req, res) => {
  try {
    const albumId = parseInt(req.params.id);
    const { video_path } = req.body;

    db.prepare('DELETE FROM album_videos WHERE album_id = ? AND video_path = ?')
      .run(albumId, video_path);

    res.json({ success: true });

  } catch (error) {
    console.error('Remove video from album error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

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

// Stream video file with range request support
app.get('/api/video', requireAuth, async (req, res) => {
  try {
    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path parameter required' });
    }

    const fullPath = sanitizePath(requestedPath);

    // Verify file exists and is a video
    const stats = await fs.promises.stat(fullPath);
    if (!stats.isFile() || !isVideoFile(fullPath)) {
      return res.status(400).json({ error: 'Invalid video file' });
    }

    const fileSize = stats.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for seeking
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      const fileStream = fs.createReadStream(fullPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': getMimeType(fullPath)
      });

      fileStream.pipe(res);
    } else {
      // Stream entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': getMimeType(fullPath)
      });

      fs.createReadStream(fullPath).pipe(res);
    }
  } catch (error) {
    console.error('Video streaming error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Download file endpoint
app.get('/api/download', requireAuth, async (req, res) => {
  try {
    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).json({ error: 'Path parameter required' });
    }

    const fullPath = sanitizePath(requestedPath);

    // Verify file exists
    const stats = await fs.promises.stat(fullPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Invalid file' });
    }

    const fileName = path.basename(fullPath);

    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);

    // Stream the file
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Download error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server (HTTP or HTTPS based on config)
if (config.https && config.https.enabled) {
  // HTTPS enabled
  const HTTPS_PORT = config.https.port || 3443;

  try {
    // Load SSL certificates
    const privateKey = fs.readFileSync(config.https.privateKeyPath, 'utf8');
    const certificate = fs.readFileSync(config.https.certificatePath, 'utf8');
    const credentials = { key: privateKey, cert: certificate };

    // Create HTTPS server
    const httpsServer = https.createServer(credentials, app);

    httpsServer.listen(HTTPS_PORT, HOST, () => {
      console.log(`\n🎬 Video Library Server Started (HTTPS)`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📁 Video Directory: ${config.videoDirectory}`);
      console.log(`🔒 HTTPS URL: https://${HOST}:${HTTPS_PORT}`);
      console.log(`🔐 SSL Certificates: Loaded`);
      console.log(`🔒 Authentication: Enabled`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`\n⚠️  SECURITY NOTICE:`);
      console.log(`   - Server is bound to ${HOST} (local only)`);
      console.log(`   - Using self-signed SSL certificate`);
      console.log(`   - Browser will show security warning (this is normal)`);
      console.log(`   - Change password in config.json`);
      console.log(`   - No external network requests allowed`);
      console.log(`\n✨ Ready to serve videos securely!\n`);
    });

    // HTTP to HTTPS redirect (if enabled)
    if (config.https.redirectHttp) {
      const httpApp = express();

      // Redirect all HTTP requests to HTTPS
      httpApp.use((req, res) => {
        const httpsUrl = `https://${req.hostname}:${HTTPS_PORT}${req.url}`;
        console.log(`↪️  Redirecting HTTP to HTTPS: ${req.url}`);
        res.redirect(301, httpsUrl);
      });

      const httpServer = http.createServer(httpApp);
      httpServer.listen(PORT, HOST, () => {
        console.log(`↪️  HTTP Redirect Server: http://${HOST}:${PORT} → https://${HOST}:${HTTPS_PORT}\n`);
      });
    }

  } catch (error) {
    console.error(`\n❌ Failed to start HTTPS server:`);
    console.error(`   ${error.message}`);
    console.error(`\n💡 Troubleshooting:`);
    console.error(`   1. Run: ./generate-ssl.sh`);
    console.error(`   2. Check certificate paths in config.json`);
    console.error(`   3. Verify files exist: ${config.https.certificatePath}`);
    console.error(`   4. Or disable HTTPS in config.json\n`);
    process.exit(1);
  }

} else {
  // HTTP only (default)
  app.listen(PORT, HOST, () => {
    console.log(`\n🎬 Video Library Server Started`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📁 Video Directory: ${config.videoDirectory}`);
    console.log(`🌐 Server URL: http://${HOST}:${PORT}`);
    console.log(`🔒 Authentication: Enabled`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n⚠️  SECURITY NOTICE:`);
    console.log(`   - Server is bound to ${HOST} (local only)`);
    console.log(`   - Change password in config.json`);
    console.log(`   - No external network requests allowed`);
    console.log(`\n💡 TIP: Enable HTTPS for encrypted connections`);
    console.log(`   Run: ./generate-ssl.sh`);
    console.log(`\n✨ Ready to serve videos!\n`);
  });
}

// Clean up on exit
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down server...');
  console.log('✅ Server stopped');
  process.exit(0);
});
