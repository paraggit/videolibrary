// Application state
let sessionToken = null;
let currentPath = '';
let allFiles = [];

// DOM elements
const loginScreen = document.getElementById('login-screen');
const app = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const searchInput = document.getElementById('search-input');
const breadcrumb = document.getElementById('breadcrumb');
const folderList = document.getElementById('folder-list');
const videoList = document.getElementById('video-list');
const videoPlayerContainer = document.getElementById('video-player-container');
const videoPlayer = document.getElementById('video-player');
const videoTitle = document.getElementById('video-title');
const closePlayer = document.getElementById('close-player');
const playbackSpeed = document.getElementById('playback-speed');
const statusMessage = document.getElementById('status-message');
const fileCount = document.getElementById('file-count');

// Initialize app
function init() {
    // Check for existing session
    sessionToken = sessionStorage.getItem('sessionToken');
    if (sessionToken) {
        showApp();
        loadDirectory('');
    }

    // Event listeners
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    searchInput.addEventListener('input', handleSearch);
    closePlayer.addEventListener('click', closeVideoPlayer);
    playbackSpeed.addEventListener('change', handleSpeedChange);
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            sessionToken = data.sessionToken;
            sessionStorage.setItem('sessionToken', sessionToken);
            loginError.textContent = '';
            showApp();
            loadDirectory('');
        } else {
            loginError.textContent = 'Invalid password';
        }
    } catch (error) {
        loginError.textContent = 'Connection error';
        console.error('Login error:', error);
    }
}

// Handle logout
async function handleLogout() {
    try {
        await fetch('/api/logout', {
            method: 'POST',
            headers: { 'X-Session-Token': sessionToken }
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    sessionToken = null;
    sessionStorage.removeItem('sessionToken');
    showLogin();
}

// Show login screen
function showLogin() {
    loginScreen.style.display = 'flex';
    app.style.display = 'none';
    document.getElementById('password').value = '';
}

// Show main app
function showApp() {
    loginScreen.style.display = 'none';
    app.style.display = 'flex';
}

// Load directory contents
async function loadDirectory(path) {
    currentPath = path;
    updateBreadcrumb(path);

    try {
        statusMessage.textContent = 'Loading...';

        const response = await fetch(`/api/browse?path=${encodeURIComponent(path)}`, {
            headers: { 'X-Session-Token': sessionToken }
        });

        if (!response.ok) {
            if (response.status === 401) {
                handleLogout();
                return;
            }
            throw new Error('Failed to load directory');
        }

        const data = await response.json();
        allFiles = data.files || [];

        displayFolders(data.folders || []);
        displayVideos(allFiles);

        statusMessage.textContent = 'Ready';
        updateFileCount(allFiles.length);
    } catch (error) {
        console.error('Load directory error:', error);
        statusMessage.textContent = 'Error loading directory';
        folderList.innerHTML = '<div class="error">Failed to load directory</div>';
    }
}

// Display folders
function displayFolders(folders) {
    if (folders.length === 0) {
        folderList.innerHTML = '<div class="empty-state">No subfolders</div>';
        return;
    }

    folderList.innerHTML = folders.map(folder => `
    <div class="folder-item" data-path="${escapeHtml(folder.path)}">
      <span class="folder-icon">📁</span>
      <span class="folder-name">${escapeHtml(folder.name)}</span>
    </div>
  `).join('');

    // Add click handlers
    document.querySelectorAll('.folder-item').forEach(item => {
        item.addEventListener('click', () => {
            const path = item.dataset.path;
            loadDirectory(path);
        });
    });
}

// Display videos
function displayVideos(files) {
    if (files.length === 0) {
        videoList.innerHTML = '<div class="empty-state">No videos in this folder</div>';
        return;
    }

    videoList.innerHTML = files.map(file => `
    <div class="video-item" data-path="${escapeHtml(file.path)}">
      <div class="video-icon">🎬</div>
      <div class="video-info">
        <div class="video-name">${escapeHtml(file.name)}</div>
        <div class="video-meta">
          ${formatFileSize(file.size)} • ${formatDate(file.modified)}
        </div>
      </div>
    </div>
  `).join('');

    // Add click handlers
    document.querySelectorAll('.video-item').forEach(item => {
        item.addEventListener('click', () => {
            const path = item.dataset.path;
            const name = item.querySelector('.video-name').textContent;
            playVideo(path, name);
        });
    });
}

// Play video
function playVideo(path, name) {
    videoTitle.textContent = name;
    videoPlayer.src = `/api/video?path=${encodeURIComponent(path)}`;
    videoPlayerContainer.style.display = 'block';
    videoPlayer.load();
    videoPlayer.play();
    statusMessage.textContent = `Playing: ${name}`;
}

// Close video player
function closeVideoPlayer() {
    videoPlayer.pause();
    videoPlayer.src = '';
    videoPlayerContainer.style.display = 'none';
    statusMessage.textContent = 'Ready';
}

// Handle playback speed change
function handleSpeedChange() {
    videoPlayer.playbackRate = parseFloat(playbackSpeed.value);
}

// Handle search
function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();

    if (!query) {
        displayVideos(allFiles);
        return;
    }

    const filtered = allFiles.filter(file =>
        file.name.toLowerCase().includes(query)
    );

    displayVideos(filtered);
    updateFileCount(filtered.length, allFiles.length);
}

// Update breadcrumb
function updateBreadcrumb(path) {
    if (!path) {
        breadcrumb.innerHTML = '<span class="breadcrumb-item active" data-path="">Home</span>';
        return;
    }

    const parts = path.split('/').filter(p => p);
    let html = '<span class="breadcrumb-item" data-path="">Home</span>';
    let currentPath = '';

    parts.forEach((part, index) => {
        currentPath += (currentPath ? '/' : '') + part;
        const isLast = index === parts.length - 1;
        html += ` <span class="breadcrumb-separator">›</span> `;
        html += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" data-path="${escapeHtml(currentPath)}">${escapeHtml(part)}</span>`;
    });

    breadcrumb.innerHTML = html;

    // Add click handlers
    document.querySelectorAll('.breadcrumb-item').forEach(item => {
        if (!item.classList.contains('active')) {
            item.addEventListener('click', () => {
                loadDirectory(item.dataset.path);
            });
        }
    });
}

// Update file count
function updateFileCount(count, total = null) {
    if (total !== null && count !== total) {
        fileCount.textContent = `Showing ${count} of ${total} videos`;
    } else {
        fileCount.textContent = `${count} video${count !== 1 ? 's' : ''}`;
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Initialize on load
init();
