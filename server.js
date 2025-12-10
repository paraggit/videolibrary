const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const https = require('https');
const http = require('http');

// Load configuration
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const app = express();
const PORT = config.port || 3000;
const HOST = config.host || '127.0.0.1';

// Initialize SQLite database
const dbPath = path.join(config.videoDirectory, 'videolibrary.db');
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
    
    CREATE INDEX IF NOT EXISTS idx_album_videos_album_id ON album_videos(album_id);
    CREATE INDEX IF NOT EXISTS idx_album_videos_video_path ON album_videos(video_path);
  `);

  console.log('✅ Database initialized:', dbPath);
}

initializeDatabase();

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
          modified: stats.mtime
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
    res.json(contents);
  } catch (error) {
    console.error('Browse error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Recursive search for videos
async function searchVideosRecursive(startPath, query, maxResults = 100) {
  const results = [];
  const lowerQuery = query.toLowerCase();

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
            const stats = await fs.promises.stat(itemPath);
            results.push({
              name: item.name,
              path: relativePath,
              folder: path.dirname(relativePath) || 'Home',
              type: getFileType(item.name),
              size: stats.size,
              modified: stats.mtime
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

    // Require at least 2 characters for search
    if (!query || query.length < 2) {
      return res.json({ results: [], count: 0 });
    }

    const fullPath = sanitizePath(startPath);
    const results = await searchVideosRecursive(fullPath, query);

    res.json({ results, count: results.length });
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

// Delete video file(s)
app.delete('/api/video', requireAuth, async (req, res) => {
  try {
    const { path: singlePath, paths: multiplePaths } = req.body;

    // Support both single and multiple file deletion
    const pathsToDelete = multiplePaths || (singlePath ? [singlePath] : []);

    if (pathsToDelete.length === 0) {
      return res.status(400).json({ error: 'No files specified for deletion' });
    }

    const results = {
      deleted: [],
      failed: []
    };

    for (const filePath of pathsToDelete) {
      try {
        const fullPath = sanitizePath(filePath);

        // Verify file exists and is a video
        const stats = await fs.promises.stat(fullPath);
        if (!stats.isFile() || !isVideoFile(fullPath)) {
          results.failed.push({ path: filePath, error: 'Invalid video file' });
          continue;
        }

        // Delete the file
        await fs.promises.unlink(fullPath);
        results.deleted.push(filePath);
        console.log(`Deleted file: ${filePath}`);

      } catch (error) {
        console.error(`Failed to delete ${filePath}:`, error.message);
        results.failed.push({ path: filePath, error: error.message });
      }
    }

    res.json({
      success: true,
      deleted: results.deleted.length,
      failed: results.failed.length,
      details: results
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
