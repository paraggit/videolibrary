# 🎬 Video Library Web App

A secure, privacy-focused local video library application that runs entirely on your local network with **zero external dependencies** or data leakage. Perfect for managing and viewing your private video collection without any copyright concerns.

## ✨ Features

- **📁 Folder Exploration**: Browse nested directory structures with an intuitive tree view
- **🎥 Video Playback**: HTML5 video player with full controls (play/pause, seek, volume, speed, fullscreen)
- **🔍 Search & Filter**: Quickly find videos by filename
- **🔒 Secure Authentication**: Password-protected access to your library
- **🌐 Local-Only**: Runs on localhost with no external network requests
- **📱 Responsive Design**: Works on desktop, tablet, and mobile devices
- **🎨 Modern UI**: Beautiful dark theme with glassmorphism effects

## 🔐 Privacy & Security Guarantees

- ✅ **100% Local**: Server binds to localhost only (no internet access)
- ✅ **Zero Data Leakage**: No thumbnails, screenshots, or metadata transmitted
- ✅ **No External Dependencies**: All resources served locally
- ✅ **Session-Based Auth**: In-memory sessions (cleared on exit)
- ✅ **Path Sanitization**: Protection against directory traversal attacks
- ✅ **CSP Headers**: Content Security Policy prevents external requests

## 📋 Requirements

- **Node.js** (v14 or higher)
- **npm** (comes with Node.js)
- A folder containing video files (MP4, AVI, MKV, MOV, WMV, FLV, WEBM, etc.)

## 🚀 Installation

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Your Video Directory**:
   Edit `config.json` and set your video folder path:
   ```json
   {
     "videoDirectory": "/path/to/your/videos",
     "port": 3000,
     "host": "127.0.0.1",
     "password": "changeme123"
   }
   ```

3. **⚠️ IMPORTANT: Change the Default Password**:
   Replace `"changeme123"` with a strong password in `config.json`

## 🎯 Usage

1. **Start the Server**:
   ```bash
   npm start
   ```
   Or:
   ```bash
   node server.js
   ```

2. **Access the Application**:
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

3. **Login**:
   Enter the password you set in `config.json`

4. **Browse and Play**:
   - Click folders in the sidebar to navigate
   - Click videos to play them
   - Use the search box to filter videos
   - Adjust playback speed (0.5x to 2x)

## ⚙️ Configuration Options

Edit `config.json` to customize:

| Option | Description | Default |
|--------|-------------|---------|
| `videoDirectory` | Path to your video folder | `/Users/paragkamble/Documents/projects/videolibrary/videos` |
| `port` | Server port | `3000` |
| `host` | Server host (use `0.0.0.0` for LAN access) | `127.0.0.1` |
| `password` | Authentication password | `changeme123` |
| `maxRecursionDepth` | Maximum folder nesting depth | `10` |
| `allowedExtensions` | Supported video formats | `[".mp4", ".avi", ...]` |

### 🌐 Accessing from Other Devices on Your Network

To access the app from other devices on your local network (e.g., phone, tablet):

1. Change `"host": "127.0.0.1"` to `"host": "0.0.0.0"` in `config.json`
2. Find your computer's local IP address:
   - **Mac/Linux**: Run `ifconfig | grep "inet "` or `hostname -I`
   - **Windows**: Run `ipconfig`
3. Access from other devices using: `http://YOUR_LOCAL_IP:3000`

## 🧪 Testing & Verification

### Basic Testing

1. **Create Test Structure**:
   ```bash
   mkdir -p videos/movies/action
   mkdir -p videos/movies/comedy
   mkdir -p videos/tv-shows
   # Add some sample MP4 files to these folders
   ```

2. **Test Features**:
   - ✅ Login with correct/incorrect password
   - ✅ Navigate through nested folders
   - ✅ Play videos with different formats
   - ✅ Test seeking (skip forward/backward)
   - ✅ Search for specific videos
   - ✅ Adjust playback speed
   - ✅ Test on mobile device

### Security Verification

1. **Check Network Traffic**:
   - Open browser DevTools (F12) → Network tab
   - Verify all requests go to `localhost:3000` only
   - Confirm no external API calls

2. **Test Path Sanitization**:
   - Try accessing: `http://localhost:3000/api/browse?path=../../etc`
   - Should return an error (not allow directory traversal)

3. **Verify Authentication**:
   - Clear browser session storage
   - Try accessing `/api/browse` directly
   - Should return 401 Unauthorized

### Advanced Testing (Optional)

Use **Wireshark** or similar tools to monitor network traffic and confirm no outbound connections.

## 📁 Project Structure

```
videolibrary/
├── server.js              # Express.js backend server
├── config.json            # Configuration file
├── package.json           # Dependencies
├── public/
│   ├── index.html        # Main UI
│   ├── app.js            # Client-side logic
│   └── styles.css        # Styling
└── README.md             # This file
```

## 🎬 Supported Video Formats

- MP4 (`.mp4`, `.m4v`)
- AVI (`.avi`)
- MKV (`.mkv`)
- MOV (`.mov`)
- WMV (`.wmv`)
- FLV (`.flv`)
- WebM (`.webm`)
- MPEG (`.mpeg`, `.mpg`)

## 🐛 Troubleshooting

### Videos Won't Play

- **Check Format**: Ensure the video codec is supported by your browser (H.264 works best)
- **File Permissions**: Verify the server has read access to video files
- **Large Files**: For files >2GB, ensure your browser supports range requests

### Can't Access from Other Devices

- **Firewall**: Check if port 3000 is blocked by your firewall
- **Host Setting**: Ensure `host` is set to `0.0.0.0` in `config.json`
- **Network**: Verify devices are on the same local network

### Server Won't Start

- **Port in Use**: Change `port` in `config.json` if 3000 is already used
- **Node Version**: Ensure you have Node.js v14 or higher (`node --version`)
- **Dependencies**: Run `npm install` to ensure Express is installed

### Deep Folder Nesting Issues

- Increase `maxRecursionDepth` in `config.json` (default is 10)
- Note: Very deep nesting may impact performance

## 🔒 Security Best Practices

1. **Change Default Password**: Always use a strong, unique password
2. **Localhost Only**: Keep `host` as `127.0.0.1` unless you need LAN access
3. **Firewall**: If using LAN access, configure firewall to allow only trusted devices
4. **Regular Updates**: Keep Node.js and dependencies updated
5. **HTTPS** (Optional): For LAN access, consider setting up HTTPS with self-signed certificates

## 📝 Edge Cases Handled

- ✅ Large video files (>1GB) with streaming support
- ✅ Deep folder nesting (configurable depth limit)
- ✅ Hidden files/folders (automatically skipped)
- ✅ Missing files or permission errors (graceful error handling)
- ✅ Unsupported file formats (filtered out)
- ✅ Directory traversal attacks (path sanitization)
- ✅ Session management (auto-cleanup on server exit)

## 🛑 Stopping the Server

Press `Ctrl+C` in the terminal where the server is running. This will:
- Shut down the server gracefully
- Clear all active sessions
- Release the port

## 📄 License

MIT License - Feel free to modify and use for personal purposes.

## 🙏 Support

This is a local-only application with no telemetry or external connections. For issues or questions, refer to the troubleshooting section above.

---

**Made with ❤️ for privacy-conscious users**
