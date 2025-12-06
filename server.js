const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load configuration
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

const app = express();
const PORT = config.port || 3000;
const HOST = config.host || '127.0.0.1';

// In-memory session storage (no persistent data)
const sessions = new Map();

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security headers to prevent external requests
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; media-src 'self'; connect-src 'self'");
  next();
});

// Generate session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Authentication middleware
function requireAuth(req, res, next) {
  const sessionToken = req.headers['x-session-token'];
  
  if (!sessionToken || !sessions.has(sessionToken)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// Sanitize path to prevent directory traversal attacks
function sanitizePath(userPath) {
  // Remove any attempts to traverse up directories
  const normalized = path.normalize(userPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(config.videoDirectory, normalized);
  
  // Ensure the path is within the video directory
  if (!fullPath.startsWith(config.videoDirectory)) {
    throw new Error('Invalid path: directory traversal detected');
  }
  
  return fullPath;
}

// Check if file is a video based on extension
function isVideoFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return config.allowedExtensions.includes(ext);
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
      } else if (item.isFile() && isVideoFile(item.name)) {
        const stats = await fs.promises.stat(itemPath);
        result.files.push({
          name: item.name,
          path: relativePath,
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
    const sessionToken = generateSessionToken();
    sessions.set(sessionToken, { createdAt: Date.now() });
    
    res.json({ success: true, sessionToken });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Logout endpoint
app.post('/api/logout', requireAuth, (req, res) => {
  const sessionToken = req.headers['x-session-token'];
  sessions.delete(sessionToken);
  res.json({ success: true });
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
        'Content-Type': 'video/mp4'
      });
      
      fileStream.pipe(res);
    } else {
      // Stream entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4'
      });
      
      fs.createReadStream(fullPath).pipe(res);
    }
  } catch (error) {
    console.error('Video streaming error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
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
  console.log(`\n✨ Ready to serve videos!\n`);
});

// Clean up sessions on exit
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down server...');
  sessions.clear();
  console.log('✅ Sessions cleared');
  process.exit(0);
});
