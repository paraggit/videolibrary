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
let thumbnailsEnabled = false;
let selectedFiles = new Set();
let currentVideoPath = '';
let currentVideoName = '';

// Smart Organization state
let allTags = [];
let filterTags = new Set();
let currentSort = localStorage.getItem('videoLibrarySort') || 'date-desc';
let favoritesSet = new Set();
let videoQueue = JSON.parse(sessionStorage.getItem('videoQueue') || '[]');
let queueIndex = -1;
let autoplayTimer = null;
let progressSaveTimer = null;

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
const rotateVideoLeftBtn = document.getElementById('rotate-video-left');
const rotateVideoRightBtn = document.getElementById('rotate-video-right');
const deleteVideoBtn = document.getElementById('delete-video-btn');

// Video player state
let currentVideoRotation = 0;
const selectionModeBtn = document.getElementById('selection-mode-btn');
const addToAlbumBtn = document.getElementById('add-to-album-btn');
const deleteBtn = document.getElementById('delete-btn');
const statusMessage = document.getElementById('status-message');
const fileCount = document.getElementById('file-count');

// View toggle DOM elements
const gridViewBtn = document.getElementById('grid-view-btn');
const listViewBtn = document.getElementById('list-view-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');

// View state
let currentView = localStorage.getItem('videoLibraryView') || 'grid';

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

// Folder and upload DOM elements
const createFolderBtn = document.getElementById('create-folder-btn');
const uploadFilesBtn = document.getElementById('upload-files-btn');
const createFolderModal = document.getElementById('create-folder-modal');
const uploadFilesModal = document.getElementById('upload-files-modal');
const folderNameInput = document.getElementById('folder-name');
const folderCreateBtn = document.getElementById('folder-create');
const folderCancelBtn = document.getElementById('folder-cancel');
const createFolderPath = document.getElementById('create-folder-path');
const fileInput = document.getElementById('file-input');
const uploadStartBtn = document.getElementById('upload-start');
const uploadCancelBtn = document.getElementById('upload-cancel');
const uploadFolderPath = document.getElementById('upload-folder-path');
const uploadProgress = document.getElementById('upload-progress');
const progressFill = document.getElementById('progress-fill');
const uploadStatus = document.getElementById('upload-status');

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

// Initialize app
function init() {
    // Event listeners
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    searchInput.addEventListener('input', handleSearch);
    document.getElementById('rating-filter').addEventListener('change', handleSearch);
    closePlayer.addEventListener('click', closeVideoPlayer);
    playbackSpeed.addEventListener('change', handleSpeedChange);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    if (rotateVideoLeftBtn) rotateVideoLeftBtn.addEventListener('click', rotateVideoLeft);
    if (rotateVideoRightBtn) rotateVideoRightBtn.addEventListener('click', rotateVideoRight);
    deleteVideoBtn.addEventListener('click', deleteCurrentVideo);
    selectionModeBtn.addEventListener('click', toggleSelectionMode);
    deleteBtn.addEventListener('click', deleteSelectedFiles);
    document.addEventListener('fullscreenchange', updateFullscreenButton);

    // View toggles
    if (gridViewBtn) gridViewBtn.addEventListener('click', () => setViewMode('grid'));
    if (listViewBtn) listViewBtn.addEventListener('click', () => setViewMode('list'));
    setViewMode(currentView);

    // Theme toggle
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    initTheme();

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
    const deleteImageBtn = document.getElementById('delete-image-btn');
    if (deleteImageBtn) deleteImageBtn.addEventListener('click', deleteCurrentImage);

    // Navigation event listeners
    prevMediaBtn.addEventListener('click', playPreviousMedia);
    nextMediaBtn.addEventListener('click', playNextMedia);
    prevImageBtn.addEventListener('click', viewPreviousImage);
    nextImageBtn.addEventListener('click', viewNextImage);

    // Folder and upload event listeners
    createFolderBtn.addEventListener('click', showCreateFolderModal);
    uploadFilesBtn.addEventListener('click', showUploadFilesModal);
    folderCreateBtn.addEventListener('click', createFolder);
    folderCancelBtn.addEventListener('click', () => createFolderModal.style.display = 'none');
    uploadStartBtn.addEventListener('click', uploadFiles);
    uploadCancelBtn.addEventListener('click', () => uploadFilesModal.style.display = 'none');

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

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Check if already authenticated by trying to load directory
    checkAuthentication();

    // Initialize rating stars
    initRatingStars();
}

// Initialize rating stars behavior
function initRatingStars() {
    const stars = document.querySelectorAll('#video-rating-container .star');

    stars.forEach(star => {
        // Hover effect
        star.addEventListener('mouseover', function () {
            const value = parseInt(this.dataset.value);
            stars.forEach(s => {
                const sValue = parseInt(s.dataset.value);
                if (sValue <= value) {
                    s.classList.add('hovered');
                } else {
                    s.classList.remove('hovered');
                }
            });
        });

        // Remove hover effect
        star.addEventListener('mouseout', function () {
            stars.forEach(s => s.classList.remove('hovered'));
        });

        // Click to rate
        star.addEventListener('click', async function () {
            const ratingValue = parseInt(this.dataset.value);
            if (!currentVideoPath) return;

            try {
                const response = await fetch('/api/rating', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ video_path: currentVideoPath, rating: ratingValue })
                });

                if (response.ok) {
                    setVideoRatingDisplay(ratingValue);

                    // Update the star rating in the allFiles list or currentMediaList
                    const media = currentMediaList.find(m => m.path === currentVideoPath);
                    if (media) {
                        media.rating = ratingValue;
                    }
                    if (isSearchMode) {
                        performSearch(searchInput.value, document.getElementById('rating-filter').value);
                    } else {
                        loadDirectory(currentPath);
                    }
                }
            } catch (error) {
                console.error("Failed to save rating:", error);
            }
        });
    });
}

// Set video rating visual display
function setVideoRatingDisplay(rating) {
    const stars = document.querySelectorAll('#video-rating-container .star');
    stars.forEach(s => {
        const sValue = parseInt(s.dataset.value);
        if (sValue <= rating) {
            s.classList.add('selected');
        } else {
            s.classList.remove('selected');
        }
    });
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
    loadFavorites();
    loadAllTags();
    updateTrashBadge();
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
        thumbnailsEnabled = data.thumbnailsEnabled || false;

        displayFolders(data.folders || []);
        const filtered = applyFilters(allFiles);
        const sorted = sortFiles(filtered);
        displayVideos(sorted);
        if (contentActions) contentActions.style.display = allFiles.length > 0 ? 'flex' : 'none';

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

        // Get appropriate icon based on file type
        let iconHtml;
        if ((file.type === 'video' || !file.type) && thumbnailsEnabled) {
            const thumbUrl = `/api/thumbnail?path=${encodeURIComponent(file.path)}`;
            iconHtml = `<img src="${thumbUrl}" alt="Thumbnail" class="video-thumbnail" onerror="this.onerror=null; this.outerHTML='🎬';">`;
        } else {
            iconHtml = getFileIcon(file.type);
        }

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
          <div class="video-icon">${iconHtml}</div>
          <div class="video-info">
            <div class="video-name">${escapeHtml(file.name)}</div>
            <div class="video-meta">
              ${formatFileSize(file.size)} • ${formatDate(file.modified)}
            </div>
            ${file.tags && file.tags.length ? `<div class="video-tags">${file.tags.map(t => `<span class="tag-chip" style="background:${t.color}">${escapeHtml(t.name)}</span>`).join('')}</div>` : ''}
            ${showFolderPath && file.folder ? `<div class="video-folder-path">📁 ${escapeHtml(file.folder)}</div>` : ''}
          </div>
          ${file.favorite ? '<span class="video-fav-icon is-fav">♥</span>' : ''}
          ${file.progress !== null && file.progress !== undefined && file.progress > 0 && file.progress < 100 ? `<div class="video-progress-bar" style="width:${file.progress}%"></div>` : ''}
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
            } else if (type === 'video') {
                playVideo(path, name);
            } else {
                // For other file types, download them
                downloadFile(path, name);
            }
        });
    });

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

    // Update file count
    fileCount.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
}

// Play video
async function playVideo(path, name) {
    // Find and store current index
    currentMediaIndex = currentMediaList.findIndex(f => f.path === path);

    // Store current video info for delete functionality
    currentVideoPath = path;
    currentVideoName = name;

    // Set video title and metadata tooltip
    videoTitle.textContent = name;

    // Build metadata tooltip if file data is available
    if (currentMediaIndex >= 0) {
        const file = currentMediaList[currentMediaIndex];
        const tooltip = `Type: ${file.type || 'video'}
Size: ${formatFileSize(file.size)}
Modified: ${formatDate(file.modified)}
Path: ${file.path}`;
        videoTitle.title = tooltip;
    } else {
        videoTitle.title = name;
    }

    videoPlayer.src = `/api/video?path=${encodeURIComponent(path)}`;
    videoPlayerContainer.style.display = 'block';

    // Reset video rotation
    currentVideoRotation = 0;
    applyVideoRotation();

    // Fetch and display rating
    try {
        const ratingRes = await fetch(`/api/rating?video_path=${encodeURIComponent(path)}`);
        if (ratingRes.ok) {
            const data = await ratingRes.json();
            setVideoRatingDisplay(data.rating || 0);
        }
    } catch (e) {
        console.error("Error fetching rating:", e);
    }

    // Record history
    try {
        await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ video_path: path })
        });
    } catch (e) {
        console.error("Error saving history:", e);
    }

    videoPlayer.play();

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

    // Update navigation button states
    updateNavigationButtons();
    statusMessage.textContent = `Playing: ${name}`;
}

// Close video player
function closeVideoPlayer() {
    stopProgressTracking();
    if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
    videoPlayer.pause();
    videoPlayer.src = '';
    videoPlayerContainer.style.display = 'none';
    currentVideoRotation = 0;
    applyVideoRotation();
    statusMessage.textContent = 'Ready';
}

// Rotate video left
function rotateVideoLeft() {
    currentVideoRotation -= 90;
    applyVideoRotation();
}

// Rotate video right
function rotateVideoRight() {
    currentVideoRotation += 90;
    applyVideoRotation();
}

// Apply rotation to video element
function applyVideoRotation() {
    if (videoPlayer) {
        // Handle aspect ratio differences during rotation
        // If it's rotated 90 or 270 degrees, we might need to adjust sizing to avoid overflow
        // but simple transform is the starting point
        const scale = (currentVideoRotation % 180 !== 0) ?
            Math.min(videoPlayerContainer.clientWidth / videoPlayer.videoHeight, videoPlayerContainer.clientHeight / videoPlayer.videoWidth, 1) : 1;

        // Use a simple transform for now to rotate.
        // We might need to adjust the CSS of video-player if rotation causes issues in fullscreen vs not
        videoPlayer.style.transform = `rotate(${currentVideoRotation}deg) scale(${scale})`;
    }
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
    const query = e.target.value ? e.target.value.trim() : searchInput.value.trim();
    const ratingFilter = document.getElementById('rating-filter').value;

    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    // If search is empty and no rating filter, return to normal browsing
    if (!query && ratingFilter === '0') {
        isSearchMode = false;
        loadDirectory(currentPath);
        return;
    }

    // Require at least 2 characters if there is a search query
    if (query && query.length < 2) {
        statusMessage.textContent = 'Type at least 2 characters to search';
        return;
    }

    // Debounce search by 300ms
    searchTimeout = setTimeout(async () => {
        await performSearch(query, ratingFilter);
    }, 300);
}

// Perform recursive search
async function performSearch(query, ratingFilter = '0') {
    isSearchMode = true;
    statusMessage.textContent = 'Searching...';

    // If we're filtering by rating, search from the root directory
    const searchPath = ratingFilter !== '0' ? '' : currentPath;

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&path=${encodeURIComponent(searchPath)}&ratingFilter=${encodeURIComponent(ratingFilter)}`, {
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
        thumbnailsEnabled = data.thumbnailsEnabled || false;
        // The endpoint may return videos from root if query is empty, let's filter if needed, 
        // or let the backend handle it. Since backend requires 2 chars for search, if query is empty but minRating > 0 we should handle it. 
        // Actually, our backend requires q >= 2 right now. We fix that locally or just rely on backend.
        // Wait, the backend says `if (!query || query.length < 2) { return res.json({ results: [], count: 0 }); }`
        // We will update the backend search endpoint to allow empty query if minRating > 0.

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

// Theme handling
function initTheme() {
    const savedTheme = localStorage.getItem('videoLibraryTheme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('videoLibraryTheme', newTheme);
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

// Get file icon based on type
function getFileIcon(type) {
    const icons = {
        'video': '🎬',
        'image': '🖼️',
        'audio': '🎵',
        'document': '📄',
        'archive': '📦',
        'code': '💻',
        'file': '📎'
    };
    return icons[type] || '📎';
}

// Download file
function downloadFile(path, name) {
    const downloadUrl = `/api/download?path=${encodeURIComponent(path)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    statusMessage.textContent = `Downloading: ${name}`;
}

// Set view mode (grid/list)
function setViewMode(mode) {
    currentView = mode;
    localStorage.setItem('videoLibraryView', mode);

    if (mode === 'list') {
        videoList.classList.add('list-view');
        if (listViewBtn) listViewBtn.classList.add('active');
        if (gridViewBtn) gridViewBtn.classList.remove('active');
    } else {
        videoList.classList.remove('list-view');
        if (gridViewBtn) gridViewBtn.classList.add('active');
        if (listViewBtn) listViewBtn.classList.remove('active');
    }
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
        if (batchMoveBtn) batchMoveBtn.style.display = 'block';
        if (batchTagBtn) batchTagBtn.style.display = 'block';
        if (batchRateBtn) batchRateBtn.style.display = 'block';
        if (batchFavBtn) batchFavBtn.style.display = 'block';
        if (selectAllBtn) selectAllBtn.style.display = 'block';
    } else {
        selectionModeBtn.textContent = '☑ Select';
        selectionModeBtn.classList.remove('active');
        addToAlbumBtn.style.display = 'none';
        if (batchMoveBtn) batchMoveBtn.style.display = 'none';
        if (batchTagBtn) batchTagBtn.style.display = 'none';
        if (batchRateBtn) batchRateBtn.style.display = 'none';
        if (batchFavBtn) batchFavBtn.style.display = 'none';
        if (selectAllBtn) selectAllBtn.style.display = 'none';
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

            showUndoToast(data.trashIds || data.lastTrashId);
            updateTrashBadge();

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

// Delete current video from video player
async function deleteCurrentVideo() {
    if (!currentVideoPath || !currentVideoName) {
        alert('No video is currently playing');
        return;
    }

    // Confirmation dialog
    if (!confirm(`Are you sure you want to permanently delete "${currentVideoName}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    statusMessage.textContent = `Deleting ${currentVideoName}...`;
    deleteVideoBtn.disabled = true;

    try {
        const response = await fetch('/api/video', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ path: currentVideoPath })
        });

        if (!response.ok) {
            throw new Error('Delete failed');
        }

        const data = await response.json();

        if (data.deleted > 0) {
            statusMessage.textContent = `Deleted ${currentVideoName} successfully`;

            // Close video player
            closeVideoPlayer();

            showUndoToast(data.lastTrashId);
            updateTrashBadge();

            // Check if there's a next video to play
            if (currentMediaIndex < currentMediaList.length - 1) {
                // Play next video
                const nextMedia = currentMediaList[currentMediaIndex + 1];
                if (nextMedia) {
                    if (nextMedia.type === 'video') {
                        playVideo(nextMedia.path, nextMedia.name);
                    } else if (nextMedia.type === 'image') {
                        viewImage(nextMedia.path, nextMedia.name, nextMedia.size, nextMedia.modified);
                    }
                }
            }

            // Reload current directory
            if (isSearchMode) {
                performSearch(searchInput.value);
            } else {
                loadDirectory(currentPath);
            }
        } else {
            alert('Failed to delete video');
        }

    } catch (error) {
        console.error('Delete error:', error);
        statusMessage.textContent = 'Delete failed';
        alert('Failed to delete video. Please try again.');
    } finally {
        deleteVideoBtn.disabled = false;
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

// Delete current image from image viewer
async function deleteCurrentImage() {
    // Current image details
    const currentMedia = currentMediaList[currentMediaIndex];
    if (!currentMedia || !currentMedia.path) {
        alert('No image is currently being viewed');
        return;
    }

    const imagePath = currentMedia.path;
    const imageName = currentMedia.name;

    // Confirmation dialog
    if (!confirm(`Are you sure you want to permanently delete "${imageName}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    statusMessage.textContent = `Deleting ${imageName}...`;
    const deleteImageBtn = document.getElementById('delete-image-btn');
    if (deleteImageBtn) deleteImageBtn.disabled = true;

    try {
        const response = await fetch('/api/video', { // Uses the same endpoint which deletes files
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ path: imagePath })
        });

        if (!response.ok) {
            throw new Error('Delete failed');
        }

        const data = await response.json();

        if (data.deleted > 0) {
            statusMessage.textContent = `Deleted ${imageName} successfully`;

            // Close image viewer
            closeImage();

            // Check if there's a next media to view
            if (currentMediaIndex < currentMediaList.length - 1) {
                // View next media
                const nextMedia = currentMediaList[currentMediaIndex + 1];
                if (nextMedia) {
                    if (nextMedia.type === 'video') {
                        playVideo(nextMedia.path, nextMedia.name);
                    } else if (nextMedia.type === 'image') {
                        viewImage(nextMedia.path, nextMedia.name, nextMedia.size, nextMedia.modified);
                    }
                }
            }

            // Reload current directory
            if (isSearchMode) {
                performSearch(searchInput.value);
            } else {
                loadDirectory(currentPath);
            }
        } else {
            alert('Failed to delete image');
        }

    } catch (error) {
        console.error('Delete error:', error);
        statusMessage.textContent = 'Delete failed';
        alert('Failed to delete image. Please try again.');
    } finally {
        if (deleteImageBtn) deleteImageBtn.disabled = false;
    }
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

// ===== FOLDER & UPLOAD FUNCTIONALITY =====

// Show create folder modal
function showCreateFolderModal() {
    createFolderPath.textContent = currentPath || '/';
    folderNameInput.value = '';
    createFolderModal.style.display = 'block';
    folderNameInput.focus();
}

// Create folder
async function createFolder() {
    const folderName = folderNameInput.value.trim();

    if (!folderName) {
        alert('Please enter a folder name');
        return;
    }

    // Validate folder name
    if (folderName.includes('/') || folderName.includes('\\') || folderName.includes('..')) {
        alert('Invalid folder name. Cannot contain /, \\, or ..');
        return;
    }

    try {
        const response = await fetch('/api/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: currentPath,
                name: folderName
            })
        });

        const result = await response.json();

        if (response.ok) {
            statusMessage.textContent = `Folder "${folderName}" created successfully`;
            createFolderModal.style.display = 'none';
            // Refresh the folder list
            loadDirectory(currentPath);
        } else {
            alert(`Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Create folder error:', error);
        alert('Failed to create folder');
    }
}

// Show upload files modal
function showUploadFilesModal() {
    uploadFolderPath.textContent = currentPath || '/';
    fileInput.value = '';
    uploadProgress.style.display = 'none';
    progressFill.style.width = '0%';
    uploadFilesModal.style.display = 'block';
}

// Upload files
async function uploadFiles() {
    const files = fileInput.files;

    if (!files || files.length === 0) {
        alert('Please select files to upload');
        return;
    }

    // Show progress
    uploadProgress.style.display = 'block';
    uploadStartBtn.disabled = true;
    uploadStatus.textContent = 'Uploading...';

    try {
        const formData = new FormData();
        formData.append('path', currentPath);

        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            progressFill.style.width = '100%';
            uploadStatus.textContent = `Uploaded ${result.uploaded} file(s)`;

            if (result.failed > 0) {
                uploadStatus.textContent += ` (${result.failed} failed)`;
            }

            statusMessage.textContent = `Successfully uploaded ${result.uploaded} file(s)`;

            // Close modal after a short delay
            setTimeout(() => {
                uploadFilesModal.style.display = 'none';
                uploadStartBtn.disabled = false;
                // Refresh the file list
                loadDirectory(currentPath);
            }, 1500);
        } else {
            alert(`Error: ${result.error}`);
            uploadStartBtn.disabled = false;
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Failed to upload files');
        uploadStartBtn.disabled = false;
    }
}

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
                `<option value="${i}">${escapeHtml(s.language)} (${escapeHtml(s.format)})</option>`
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
            `<span class="tag-chip" style="background:${t.color}">${escapeHtml(t.name)}</span>`
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
    if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }

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

function showUndoToast(trashIdOrIds) {
    if (!trashIdOrIds) return;
    // Support both single ID and array of IDs
    const trashIds = Array.isArray(trashIdOrIds) ? trashIdOrIds : [trashIdOrIds];
    const toast = document.getElementById('undo-toast');
    toast.style.display = 'flex';
    const timeout = setTimeout(() => { toast.style.display = 'none'; }, 5000);
    document.getElementById('undo-restore-btn').onclick = async () => {
        clearTimeout(timeout);
        toast.style.display = 'none';
        // Restore all trash items
        for (const id of trashIds) {
            await fetch('/api/trash/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ id }) });
        }
        updateTrashBadge();
        if (isSearchMode) performSearch(searchInput.value); else loadDirectory(currentPath);
        statusMessage.textContent = trashIds.length === 1 ? 'File restored from trash' : `${trashIds.length} files restored from trash`;
    };
}

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
        star.onmouseover = () => {
            const val = parseInt(star.dataset.value);
            stars.forEach(s => s.classList.toggle('hovered', parseInt(s.dataset.value) <= val));
        };
        star.onmouseout = () => stars.forEach(s => s.classList.remove('hovered'));
        star.onclick = async () => {
            modal.style.display = 'none';
            await fetch('/api/video/batch-rate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ paths: Array.from(selectedFiles), rating: parseInt(star.dataset.value) }) });
            statusMessage.textContent = `Rated ${selectedFiles.size} files`;
            loadDirectory(currentPath);
        };
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
                    <span class="stats-bar-label">${escapeHtml(type)}</span>
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

// Initialize on load
init();
