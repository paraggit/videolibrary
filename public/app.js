// ===== PRIVACY & NETWORK ISOLATION =====
// Network request monitor - Block all external requests for privacy
(function () {
    const originalFetch = window.fetch;
    const originalXHR = window.XMLHttpRequest.prototype.open;

    // Override fetch to block external requests
    window.fetch = function (...args) {
        const url = args[0];

        // Check if URL is external
        if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
            if (!url.startsWith(window.location.origin)) {
                console.error('🚫 PRIVACY BLOCK: External fetch request to', url);
                console.warn('⚠️  All external requests are blocked to protect your privacy');
                return Promise.reject(new Error('External requests are blocked for privacy protection'));
            }
        }

        return originalFetch.apply(this, args);
    };

    // Override XMLHttpRequest to block external requests
    window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
            if (!url.startsWith(window.location.origin)) {
                console.error('🚫 PRIVACY BLOCK: External XHR request to', url);
                console.warn('⚠️  All external requests are blocked to protect your privacy');
                throw new Error('External requests are blocked for privacy protection');
            }
        }

        return originalXHR.call(this, method, url, ...rest);
    };

    console.log('✅ Privacy Protection Active: External network requests are blocked');
    console.log('📡 Only local requests to', window.location.origin, 'are allowed');
})();

// Application state
let currentPath = '';
let allFiles = [];
let searchTimeout = null;
let isSearchMode = false;
let selectionMode = false;
let selectedFiles = new Set();

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
const fullscreenBtn = document.getElementById('fullscreen-btn');
const selectionModeBtn = document.getElementById('selection-mode-btn');
const addToAlbumBtn = document.getElementById('add-to-album-btn');
const deleteBtn = document.getElementById('delete-btn');
const statusMessage = document.getElementById('status-message');
const fileCount = document.getElementById('file-count');

// Album and Rename DOM elements
const albumsBtn = document.getElementById('albums-btn');
const renameModal = document.getElementById('rename-modal');
const renameInput = document.getElementById('rename-input');
const renameConfirm = document.getElementById('rename-confirm');
const renameCancel = document.getElementById('rename-cancel');
const albumModal = document.getElementById('album-modal');
const albumName = document.getElementById('album-name');
const albumDescription = document.getElementById('album-description');
const albumCreate = document.getElementById('album-create');
const albumCancel = document.getElementById('album-cancel');
const addToAlbumModal = document.getElementById('add-to-album-modal');
const albumListContainer = document.getElementById('album-list-container');
const addToAlbumCancel = document.getElementById('add-to-album-cancel');
const albumsView = document.getElementById('albums-view');
const albumsClose = document.getElementById('albums-close');
const createAlbumBtn = document.getElementById('create-album-btn');
const albumsList = document.getElementById('albums-list');
const albumDetailView = document.getElementById('album-detail-view');
const albumDetailTitle = document.getElementById('album-detail-title');
const albumDetailDescription = document.getElementById('album-detail-description');
const albumDetailClose = document.getElementById('album-detail-close');
const albumDeleteBtn = document.getElementById('album-delete-btn');
const albumVideosList = document.getElementById('album-videos-list');

// State for rename and albums
let currentRenameFile = null;
let currentAlbumId = null;

// Image viewer DOM elements
const imageViewer = document.getElementById('image-viewer');
const imageDisplay = document.getElementById('image-display');
const imageTitle = document.getElementById('image-title');
const imageSize = document.getElementById('image-size');
const imageModified = document.getElementById('image-modified');
const closeImageViewer = document.getElementById('close-image-viewer');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const rotateLeftBtn = document.getElementById('rotate-left');
const rotateRightBtn = document.getElementById('rotate-right');
const fullscreenImageBtn = document.getElementById('fullscreen-image');

// Image viewer state
let currentZoom = 1;
let currentRotation = 0;

// Navigation state
let currentMediaIndex = -1;
let currentMediaList = [];

// Navigation button DOM elements
const prevMediaBtn = document.getElementById('prev-media-btn');
const nextMediaBtn = document.getElementById('next-media-btn');
const prevImageBtn = document.getElementById('prev-image-btn');
const nextImageBtn = document.getElementById('next-image-btn');

// Initialize app
function init() {
    // Event listeners
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    searchInput.addEventListener('input', handleSearch);
    closePlayer.addEventListener('click', closeVideoPlayer);
    playbackSpeed.addEventListener('change', handleSpeedChange);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    selectionModeBtn.addEventListener('click', toggleSelectionMode);
    deleteBtn.addEventListener('click', deleteSelectedFiles);
    document.addEventListener('fullscreenchange', updateFullscreenButton);

    // Album and rename event listeners
    albumsBtn.addEventListener('click', showAlbumsView);
    addToAlbumBtn.addEventListener('click', showAddToAlbumModal);
    renameConfirm.addEventListener('click', confirmRename);
    renameCancel.addEventListener('click', () => renameModal.style.display = 'none');
    albumCreate.addEventListener('click', createAlbum);
    albumCancel.addEventListener('click', () => albumModal.style.display = 'none');
    addToAlbumCancel.addEventListener('click', () => addToAlbumModal.style.display = 'none');
    albumsClose.addEventListener('click', () => albumsView.style.display = 'none');
    createAlbumBtn.addEventListener('click', showCreateAlbumModal);
    albumDetailClose.addEventListener('click', () => albumDetailView.style.display = 'none');
    albumDeleteBtn.addEventListener('click', deleteCurrentAlbum);

    // Image viewer event listeners
    closeImageViewer.addEventListener('click', closeImage);
    zoomInBtn.addEventListener('click', zoomIn);
    zoomOutBtn.addEventListener('click', zoomOut);
    zoomResetBtn.addEventListener('click', resetImageTransform);
    rotateLeftBtn.addEventListener('click', rotateLeft);
    rotateRightBtn.addEventListener('click', rotateRight);
    fullscreenImageBtn.addEventListener('click', toggleImageFullscreen);

    // Navigation event listeners
    prevMediaBtn.addEventListener('click', playPreviousMedia);
    nextMediaBtn.addEventListener('click', playNextMedia);
    prevImageBtn.addEventListener('click', viewPreviousImage);
    nextImageBtn.addEventListener('click', viewNextImage);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Check if already authenticated by trying to load directory
    checkAuthentication();
}

// Check if user is already authenticated
async function checkAuthentication() {
    try {
        const response = await fetch('/api/browse?path=', {
            credentials: 'same-origin'
        });

        if (response.ok) {
            showApp();
            loadDirectory('');
        }
    } catch (error) {
        // User not authenticated, stay on login screen
        console.log('Not authenticated');
    }
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
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
            credentials: 'same-origin'
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

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
    isSearchMode = false;
    selectionMode = false;
    selectedFiles.clear();
    searchInput.value = ''; // Clear search when navigating
    updateSelectionUI();
    updateBreadcrumb(path);

    try {
        statusMessage.textContent = 'Loading...';

        const response = await fetch(`/api/browse?path=${encodeURIComponent(path)}`, {
            credentials: 'same-origin'
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
function displayVideos(files, showFolderPath = false) {
    // Store files for navigation
    currentMediaList = files;

    if (files.length === 0) {
        const message = isSearchMode ? 'No videos found matching your search' : 'No videos in this folder';
        videoList.innerHTML = `<div class="empty-state">${message}</div>`;
        return;
    }

    videoList.innerHTML = files.map(file => {
        const isSelected = selectedFiles.has(file.path);
        const selectionClass = selectionMode ? 'selection-mode' : '';
        const selectedClass = isSelected ? 'selected' : '';
        const isImage = file.type === 'image';
        const icon = isImage ? '🖼️' : '🎬';

        // Create detailed tooltip
        const tooltip = `Type: ${file.type || 'video'}
Size: ${formatFileSize(file.size)}
Modified: ${formatDate(file.modified)}
Path: ${file.path}`;

        return `
        <div class="video-item ${selectionClass} ${selectedClass}" 
             data-path="${escapeHtml(file.path)}" 
             data-type="${file.type || 'video'}"
             title="${escapeHtml(tooltip)}">
          ${selectionMode ? `<input type="checkbox" class="video-checkbox" ${isSelected ? 'checked' : ''}>` : ''}
          <div class="video-icon">${icon}</div>
          <div class="video-info">
            <div class="video-name">${escapeHtml(file.name)}</div>
            <div class="video-meta">
              ${formatFileSize(file.size)} • ${formatDate(file.modified)}
            </div>
            ${showFolderPath && file.folder ? `<div class="video-folder-path">📁 ${escapeHtml(file.folder)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers
    document.querySelectorAll('.video-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const path = item.dataset.path;
            const type = item.dataset.type;
            const name = item.querySelector('.video-name').textContent;

            if (selectionMode) {
                toggleFileSelection(path);
            } else if (type === 'image') {
                // Find file data for size and modified date
                const fileData = files.find(f => f.path === path);
                viewImage(path, name, fileData.size, fileData.modified);
            } else {
                playVideo(path, name);
            }
        });
    });

    // Update file count
    fileCount.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
}

// Play video
function playVideo(path, name) {
    // Find and store current index
    currentMediaIndex = currentMediaList.findIndex(f => f.path === path);

    videoTitle.textContent = name;
    videoPlayer.src = `/api/video?path=${encodeURIComponent(path)}`;
    videoPlayerContainer.style.display = 'block';
    videoPlayer.play();

    // Update navigation button states
    updateNavigationButtons();
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

// Toggle fullscreen
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        videoPlayerContainer.requestFullscreen().catch(err => {
            console.error('Fullscreen error:', err);
            statusMessage.textContent = 'Fullscreen not supported';
        });
    } else {
        document.exitFullscreen();
    }
}

// Update fullscreen button state
function updateFullscreenButton() {
    if (document.fullscreenElement) {
        fullscreenBtn.innerHTML = '⛶ Exit Fullscreen';
        fullscreenBtn.title = 'Exit Fullscreen (F or ESC)';
    } else {
        fullscreenBtn.innerHTML = '⛶ Fullscreen';
        fullscreenBtn.title = 'Fullscreen (F)';
    }
}

// Handle keyboard shortcuts
function handleKeyboard(e) {
    // ESC key - close player/viewer
    if (e.key === 'Escape') {
        if (videoPlayerContainer.style.display !== 'none') {
            closeVideoPlayer();
        } else if (imageViewer.style.display !== 'none') {
            closeImage();
        }
    }

    // Arrow keys for navigation
    if (e.key === 'ArrowLeft') {
        if (videoPlayerContainer.style.display !== 'none') {
            e.preventDefault();
            playPreviousMedia();
        } else if (imageViewer.style.display !== 'none') {
            e.preventDefault();
            viewPreviousImage();
        }
    }

    if (e.key === 'ArrowRight') {
        if (videoPlayerContainer.style.display !== 'none') {
            e.preventDefault();
            playNextMedia();
        } else if (imageViewer.style.display !== 'none') {
            e.preventDefault();
            viewNextImage();
        }
    }

    // F key - fullscreen
    if (e.key === 'f' || e.key === 'F') {
        if (videoPlayerContainer.style.display !== 'none') {
            toggleFullscreen();
        } else if (imageViewer.style.display !== 'none') {
            toggleImageFullscreen();
        }
    }
}
// Handle search with debouncing
function handleSearch(e) {
    const query = e.target.value.trim();

    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    // If search is empty, return to normal browsing
    if (!query) {
        isSearchMode = false;
        loadDirectory(currentPath);
        return;
    }

    // Require at least 2 characters
    if (query.length < 2) {
        statusMessage.textContent = 'Type at least 2 characters to search';
        return;
    }

    // Debounce search by 300ms
    searchTimeout = setTimeout(async () => {
        await performSearch(query);
    }, 300);
}

// Perform recursive search
async function performSearch(query) {
    isSearchMode = true;
    statusMessage.textContent = 'Searching...';

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&path=${encodeURIComponent(currentPath)}`, {
            credentials: 'same-origin'
        });

        if (!response.ok) {
            if (response.status === 401) {
                handleLogout();
                return;
            }
            throw new Error('Search failed');
        }

        const data = await response.json();
        displayVideos(data.results, true); // Show folder paths in search results

        if (data.count > 0) {
            statusMessage.textContent = `Found ${data.count} video${data.count !== 1 ? 's' : ''}`;
            updateFileCount(data.count);
        } else {
            statusMessage.textContent = 'No videos found';
            updateFileCount(0);
        }
    } catch (error) {
        console.error('Search error:', error);
        statusMessage.textContent = 'Search failed';
        videoList.innerHTML = '<div class="error">Search failed. Please try again.</div>';
    }
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

// Selection Mode Functions

// Toggle selection mode
function toggleSelectionMode() {
    selectionMode = !selectionMode;
    selectedFiles.clear();
    updateSelectionUI();

    // Redisplay current view
    if (isSearchMode) {
        displayVideos(allFiles, true);
    } else {
        displayVideos(allFiles, false);
    }
}

// Update selection UI (button text and delete button visibility)
function updateSelectionUI() {
    if (selectionMode) {
        selectionModeBtn.textContent = '✕ Cancel';
        selectionModeBtn.classList.add('active');
        addToAlbumBtn.style.display = 'block';
    } else {
        selectionModeBtn.textContent = '☑ Select';
        selectionModeBtn.classList.remove('active');
        addToAlbumBtn.style.display = 'none';
    }
    updateDeleteButton();
}

// Toggle file selection
function toggleFileSelection(path) {
    if (selectedFiles.has(path)) {
        selectedFiles.delete(path);
    } else {
        selectedFiles.add(path);
    }

    updateDeleteButton();
    updateCheckboxes();
}

// Update delete button visibility and text
function updateDeleteButton() {
    if (selectedFiles.size > 0) {
        deleteBtn.style.display = 'block';
        deleteBtn.textContent = `🗑 Delete (${selectedFiles.size})`;
    } else {
        deleteBtn.style.display = 'none';
    }
}

// Update checkbox states
function updateCheckboxes() {
    document.querySelectorAll('.video-item').forEach(item => {
        const path = item.dataset.path;
        const checkbox = item.querySelector('.video-checkbox');
        const isSelected = selectedFiles.has(path);

        if (checkbox) {
            checkbox.checked = isSelected;
        }

        if (isSelected) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

// Delete selected files
async function deleteSelectedFiles() {
    const count = selectedFiles.size;
    const fileWord = count === 1 ? 'file' : 'files';

    // Confirmation dialog
    if (!confirm(`Are you sure you want to permanently delete ${count} ${fileWord}?\n\nThis action cannot be undone.`)) {
        return;
    }

    statusMessage.textContent = `Deleting ${count} ${fileWord}...`;
    deleteBtn.disabled = true;

    try {
        const response = await fetch('/api/video', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ paths: Array.from(selectedFiles) })
        });

        if (!response.ok) {
            throw new Error('Delete failed');
        }

        const data = await response.json();

        if (data.deleted > 0) {
            statusMessage.textContent = `Deleted ${data.deleted} ${fileWord} successfully`;
            selectedFiles.clear();
            selectionMode = false;
            updateSelectionUI();

            // Reload current directory
            if (isSearchMode) {
                performSearch(searchInput.value);
            } else {
                loadDirectory(currentPath);
            }
        }

        if (data.failed > 0) {
            console.error('Some files failed to delete:', data.details.failed);
            alert(`${data.deleted} files deleted, ${data.failed} failed. Check console for details.`);
        }

    } catch (error) {
        console.error('Delete error:', error);
        statusMessage.textContent = 'Delete failed';
        alert('Failed to delete files. Please try again.');
    } finally {
        deleteBtn.disabled = false;
    }
}

// ===== RENAME FUNCTIONALITY =====

// Show rename modal for a file
function showRenameModal(filePath, currentName) {
    currentRenameFile = filePath;
    renameInput.value = currentName;
    renameModal.style.display = 'flex';
    renameInput.focus();
    renameInput.select();
}

// Confirm rename
async function confirmRename() {
    const newName = renameInput.value.trim();

    if (!newName) {
        alert('Please enter a filename');
        return;
    }

    if (newName === path.basename(currentRenameFile)) {
        renameModal.style.display = 'none';
        return;
    }

    statusMessage.textContent = 'Renaming file...';

    try {
        const response = await fetch('/api/video/rename', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ path: currentRenameFile, newName })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Rename failed');
        }

        statusMessage.textContent = 'File renamed successfully';
        renameModal.style.display = 'none';

        // Reload current directory
        if (isSearchMode) {
            performSearch(searchInput.value);
        } else {
            loadDirectory(currentPath);
        }

    } catch (error) {
        console.error('Rename error:', error);
        statusMessage.textContent = 'Rename failed';
        alert(error.message || 'Failed to rename file');
    }
}

// ===== ALBUM FUNCTIONALITY =====

// Show albums view
async function showAlbumsView() {
    albumsView.style.display = 'flex';
    await loadAlbums();
}

// Load and display all albums
async function loadAlbums() {
    try {
        const response = await fetch('/api/albums', {
            credentials: 'same-origin'
        });

        const data = await response.json();

        if (data.albums.length === 0) {
            albumsList.innerHTML = `
                <div class="empty-albums">
                    <p>No albums yet</p>
                    <p>Create your first album to organize your videos</p>
                </div>
            `;
            return;
        }

        albumsList.innerHTML = data.albums.map(album => `
            <div class="album-card" data-album-id="${album.id}">
                <div class="album-card-title">${escapeHtml(album.name)}</div>
                <div class="album-card-description">${escapeHtml(album.description || '')}</div>
                <div class="album-card-count">${album.video_count} video${album.video_count !== 1 ? 's' : ''}</div>
            </div>
        `).join('');

        // Add click handlers
        document.querySelectorAll('.album-card').forEach(card => {
            card.addEventListener('click', () => {
                const albumId = parseInt(card.dataset.albumId);
                showAlbumDetail(albumId);
            });
        });

    } catch (error) {
        console.error('Load albums error:', error);
        albumsList.innerHTML = '<div class="error">Failed to load albums</div>';
    }
}

// Show create album modal
function showCreateAlbumModal() {
    albumName.value = '';
    albumDescription.value = '';
    albumModal.style.display = 'flex';
    albumName.focus();
}

// Create new album
async function createAlbum() {
    const name = albumName.value.trim();
    const description = albumDescription.value.trim();

    if (!name) {
        alert('Please enter an album name');
        return;
    }

    try {
        const response = await fetch('/api/albums', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ name, description })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create album');
        }

        albumModal.style.display = 'none';
        statusMessage.textContent = `Album "${name}" created`;
        await loadAlbums();

    } catch (error) {
        console.error('Create album error:', error);
        alert(error.message || 'Failed to create album');
    }
}

// Show album detail view
async function showAlbumDetail(albumId) {
    currentAlbumId = albumId;
    albumsView.style.display = 'none';
    albumDetailView.style.display = 'flex';

    try {
        const response = await fetch(`/api/albums/${albumId}`, {
            credentials: 'same-origin'
        });

        const data = await response.json();

        albumDetailTitle.textContent = data.album.name;
        albumDetailDescription.textContent = data.album.description || 'No description';

        if (data.videos.length === 0) {
            albumVideosList.innerHTML = '<div class="empty-state">No videos in this album</div>';
            return;
        }

        // Display videos using the same format as main video list
        albumVideosList.innerHTML = data.videos.map(file => `
            <div class="video-item" data-path="${escapeHtml(file.path)}">
                <div class="video-icon">🎬</div>
                <div class="video-info">
                    <div class="video-name">${escapeHtml(file.name)}</div>
                    <div class="video-meta">
                        ${formatFileSize(file.size)} • ${formatDate(file.modified)}
                    </div>
                    <div class="video-folder-path">📁 ${escapeHtml(file.folder)}</div>
                </div>
                <button class="btn-secondary remove-from-album-btn" data-path="${escapeHtml(file.path)}">Remove</button>
            </div>
        `).join('');

        // Add click handlers for playing videos
        document.querySelectorAll('#album-videos-list .video-item').forEach(item => {
            const videoIcon = item.querySelector('.video-icon, .video-info');
            videoIcon.addEventListener('click', () => {
                const path = item.dataset.path;
                const name = item.querySelector('.video-name').textContent;
                playVideo(path, name);
            });
        });

        // Add click handlers for remove buttons
        document.querySelectorAll('.remove-from-album-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const videoPath = btn.dataset.path;
                await removeFromAlbum(albumId, videoPath);
            });
        });

    } catch (error) {
        console.error('Load album detail error:', error);
        albumVideosList.innerHTML = '<div class="error">Failed to load album</div>';
    }
}

// Remove video from album
async function removeFromAlbum(albumId, videoPath) {
    try {
        const response = await fetch(`/api/albums/${albumId}/videos`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ video_path: videoPath })
        });

        if (!response.ok) {
            throw new Error('Failed to remove video from album');
        }

        statusMessage.textContent = 'Video removed from album';
        await showAlbumDetail(albumId);

    } catch (error) {
        console.error('Remove from album error:', error);
        alert('Failed to remove video from album');
    }
}

// Delete current album
async function deleteCurrentAlbum() {
    if (!currentAlbumId) return;

    if (!confirm('Are you sure you want to delete this album?\n\nVideos will not be deleted, only the album.')) {
        return;
    }

    try {
        const response = await fetch(`/api/albums/${currentAlbumId}`, {
            method: 'DELETE',
            credentials: 'same-origin'
        });

        if (!response.ok) {
            throw new Error('Failed to delete album');
        }

        statusMessage.textContent = 'Album deleted';
        albumDetailView.style.display = 'none';
        await showAlbumsView();

    } catch (error) {
        console.error('Delete album error:', error);
        alert('Failed to delete album');
    }
}

// Show add to album modal
async function showAddToAlbumModal() {
    if (selectedFiles.size === 0) {
        alert('Please select files first');
        return;
    }

    addToAlbumModal.style.display = 'flex';

    try {
        const response = await fetch('/api/albums', {
            credentials: 'same-origin'
        });

        const data = await response.json();

        if (data.albums.length === 0) {
            albumListContainer.innerHTML = `
                <div class="empty-state">
                    <p>No albums yet. Create an album first.</p>
                </div>
            `;
            return;
        }

        albumListContainer.innerHTML = data.albums.map(album => `
            <div class="album-select-item" data-album-id="${album.id}">
                <h4>${escapeHtml(album.name)}</h4>
                <p>${album.video_count} video${album.video_count !== 1 ? 's' : ''}</p>
            </div>
        `).join('');

        // Add click handlers
        document.querySelectorAll('.album-select-item').forEach(item => {
            item.addEventListener('click', async () => {
                const albumId = parseInt(item.dataset.albumId);
                await addSelectedToAlbum(albumId);
            });
        });

    } catch (error) {
        console.error('Load albums for selection error:', error);
        albumListContainer.innerHTML = '<div class="error">Failed to load albums</div>';
    }
}

// Add selected files to album
async function addSelectedToAlbum(albumId) {
    const paths = Array.from(selectedFiles);
    let added = 0;
    let failed = 0;

    for (const videoPath of paths) {
        try {
            const response = await fetch(`/api/albums/${albumId}/videos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ video_path: videoPath })
            });

            if (response.ok) {
                added++;
            } else {
                failed++;
            }
        } catch (error) {
            failed++;
        }
    }

    addToAlbumModal.style.display = 'none';

    if (added > 0) {
        statusMessage.textContent = `Added ${added} video${added !== 1 ? 's' : ''} to album`;
    }

    if (failed > 0) {
        alert(`${added} videos added, ${failed} failed (may already be in album)`);
    }
}

// ===== IMAGE VIEWER FUNCTIONALITY =====

// View image
function viewImage(imagePath, imageName, fileSize, fileModified) {
    // Find and store current index
    currentMediaIndex = currentMediaList.findIndex(f => f.path === imagePath);

    const imageUrl = `/api/image?path=${encodeURIComponent(imagePath)}`;

    imageDisplay.src = imageUrl;
    imageTitle.textContent = imageName;
    imageSize.textContent = `Size: ${formatFileSize(fileSize)}`;
    imageModified.textContent = `Modified: ${formatDate(fileModified)}`;

    // Reset transform
    currentZoom = 1;
    currentRotation = 0;
    updateImageTransform();

    imageViewer.style.display = 'flex';

    // Update navigation button states
    updateNavigationButtons();
}

// Close image viewer
function closeImage() {
    imageViewer.style.display = 'none';
    imageDisplay.src = '';
}

// Zoom in
function zoomIn() {
    currentZoom += 0.25;
    updateImageTransform();
}

// Zoom out
function zoomOut() {
    currentZoom = Math.max(0.25, currentZoom - 0.25);
    updateImageTransform();
}

// Reset zoom and rotation
function resetImageTransform() {
    currentZoom = 1;
    currentRotation = 0;
    updateImageTransform();
}

// Rotate left
function rotateLeft() {
    currentRotation -= 90;
    updateImageTransform();
}

// Rotate right
function rotateRight() {
    currentRotation += 90;
    updateImageTransform();
}

// Update image transform
function updateImageTransform() {
    imageDisplay.style.transform = `scale(${currentZoom}) rotate(${currentRotation}deg)`;
}

// Toggle fullscreen for image
function toggleImageFullscreen() {
    const container = imageViewer.querySelector('.image-viewer-container');

    if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// ===== NAVIGATION FUNCTIONALITY =====

// Update navigation button states
function updateNavigationButtons() {
    const hasPrev = currentMediaIndex > 0;
    const hasNext = currentMediaIndex < currentMediaList.length - 1;

    // Update video player buttons
    if (prevMediaBtn) {
        prevMediaBtn.disabled = !hasPrev;
        prevMediaBtn.style.opacity = hasPrev ? '1' : '0.5';
    }
    if (nextMediaBtn) {
        nextMediaBtn.disabled = !hasNext;
        nextMediaBtn.style.opacity = hasNext ? '1' : '0.5';
    }

    // Update image viewer buttons
    if (prevImageBtn) {
        prevImageBtn.disabled = !hasPrev;
        prevImageBtn.style.opacity = hasPrev ? '1' : '0.5';
    }
    if (nextImageBtn) {
        nextImageBtn.disabled = !hasNext;
        nextImageBtn.style.opacity = hasNext ? '1' : '0.5';
    }
}

// Play previous media
function playPreviousMedia() {
    if (currentMediaIndex <= 0) return;

    const prevMedia = currentMediaList[currentMediaIndex - 1];
    if (!prevMedia) return;

    if (prevMedia.type === 'image') {
        closeVideoPlayer();
        viewImage(prevMedia.path, prevMedia.name, prevMedia.size, prevMedia.modified);
    } else {
        playVideo(prevMedia.path, prevMedia.name);
    }
}

// Play next media
function playNextMedia() {
    if (currentMediaIndex >= currentMediaList.length - 1) return;

    const nextMedia = currentMediaList[currentMediaIndex + 1];
    if (!nextMedia) return;

    if (nextMedia.type === 'image') {
        closeVideoPlayer();
        viewImage(nextMedia.path, nextMedia.name, nextMedia.size, nextMedia.modified);
    } else {
        playVideo(nextMedia.path, nextMedia.name);
    }
}

// View previous image
function viewPreviousImage() {
    if (currentMediaIndex <= 0) return;

    const prevMedia = currentMediaList[currentMediaIndex - 1];
    if (!prevMedia) return;

    if (prevMedia.type === 'video') {
        closeImage();
        playVideo(prevMedia.path, prevMedia.name);
    } else {
        viewImage(prevMedia.path, prevMedia.name, prevMedia.size, prevMedia.modified);
    }
}

// View next image
function viewNextImage() {
    if (currentMediaIndex >= currentMediaList.length - 1) return;

    const nextMedia = currentMediaList[currentMediaIndex + 1];
    if (!nextMedia) return;

    if (nextMedia.type === 'video') {
        closeImage();
        playVideo(nextMedia.path, nextMedia.name);
    } else {
        viewImage(nextMedia.path, nextMedia.name, nextMedia.size, nextMedia.modified);
    }
}

// Initialize on load
init();
