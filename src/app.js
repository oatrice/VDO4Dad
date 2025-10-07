document.addEventListener('DOMContentLoaded', () => {
    const videoPlayer = document.getElementById('main-video-player');
    const videoTitle = document.getElementById('video-title');
    const videoDescription = document.getElementById('video-description');
    const videoListContainer = document.getElementById('video-list');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    // Queue Manager elements
    const queueUrlInput = document.getElementById('queue-url-input');
    const addToQueueBtn = document.getElementById('add-to-queue-btn');
    const queueListWrapper = document.getElementById('queue-list-wrapper');
    const queueList = document.getElementById('queue-list');
    let clearQueueBtn = null; // Will be created dynamically

    let videos = [];
    let currentVideoIndex = 0;
    let activeDownloads = new Set(); // For tracking incomplete downloads
    let queueData = []; // Store queue data

    // Add unload listener to log incomplete downloads
    window.addEventListener('beforeunload', () => {
        if (activeDownloads.size > 0) {
            const message = `Page is closing with ${activeDownloads.size} active downloads. These will be interrupted.`;
            // Use beacon for reliability on unload
            logToServer('warn', `[Incomplete] ${message}`, { activeIds: [...activeDownloads] }, true);
        }
    });

    // Fetch video data from videos.json
    fetch('./data/videos.json')
        .then(response => response.json())
        .then(data => {
            videos = data;
            if (videos.length > 0) {
                renderVideoList();
                playVideo(0);
            }
        })
        .catch(error => {
            console.error('Error fetching video data:', error);
            videoListContainer.textContent = 'ไม่สามารถโหลดรายการวิดีโอได้';
        });

    // Function to render the list of videos
    function renderVideoList() {
        videoListContainer.innerHTML = ''; // Clear existing list
        videos.forEach((video, index) => {
            const videoItem = document.createElement('div');
            videoItem.classList.add('video-list-item');
            videoItem.textContent = video.title;
            videoItem.addEventListener('click', () => {
                playVideo(index);
            });
            videoListContainer.appendChild(videoItem);
        });
    }

    // Function to play a specific video
    function playVideo(index) {
        if (index < 0 || index >= videos.length) return;

        currentVideoIndex = index;
        const video = videos[currentVideoIndex];

        videoPlayer.src = video.filePath;
        videoTitle.textContent = video.title;
        videoDescription.textContent = video.description;
        videoPlayer.play();

        // Highlight the current video in the list
        Array.from(videoListContainer.children).forEach((item, i) => {
            item.classList.toggle('active', i === currentVideoIndex);
        });
    }

    // Event listeners for next and previous buttons
    prevBtn.addEventListener('click', () => {
        const newIndex = (currentVideoIndex - 1 + videos.length) % videos.length;
        playVideo(newIndex);
    });

    nextBtn.addEventListener('click', () => {
        const newIndex = (currentVideoIndex + 1) % videos.length;
        playVideo(newIndex);
    });

    // Function to send logs to the server
    function logToServer(level, message, data = null, useBeacon = false) {
        const consoleMethod = console[level] || console.log;
        consoleMethod(message, data || '');

        const logLevel = level === 'log' ? 'info' : level;
        const body = JSON.stringify({ level: logLevel, message, data });

        if (useBeacon && navigator.sendBeacon) {
            try {
                // Use sendBeacon for reliability on page unload
                navigator.sendBeacon('http://localhost:3000/log', body);
            } catch (e) {
                // Fallback for cases where beacon fails (e.g., data too large)
                fetch('http://localhost:3000/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                }).catch(err => console.error('Failed to send log to server:', err));
            }
        } else {
            fetch('http://localhost:3000/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            }).catch(err => console.error('Failed to send log to server:', err));
        }
    }

    // ========== Queue Manager Functions ==========

    // Load queue data from server
    async function loadQueue(showLoading = false) {
        try {
            if (showLoading) {
                showLoadingState('กำลังโหลดคิว...');
            }
            
            const response = await fetch('http://localhost:3000/api/queue');
            const data = await response.json();
            
            if (data.success) {
                queueData = data.queue;
                renderQueue();
                logToServer('info', 'Queue data loaded', { count: queueData.length });
            } else {
                logToServer('error', 'Failed to load queue', data);
            }
        } catch (error) {
            logToServer('error', 'Error loading queue', { error: error.message });
            console.error('Error loading queue:', error);
        }
    }

    // Render queue items
    function renderQueue() {
        if (queueData.length === 0) {
            queueListWrapper.innerHTML = `
                <div class="queue-empty">
                    <div class="queue-empty-icon">📭</div>
                    <p>ไม่มีรายการในคิว</p>
                    <p style="font-size: 0.9rem;">เพิ่ม URL ของวิดีโอที่ต้องการดาวน์โหลดด้านบน</p>
                </div>
            `;
            clearQueueBtn = null;
            return;
        }

        // Create header with Clear All button
        const headerHtml = `
            <div class="queue-list-header">
                <h3 class="queue-list-title">รายการคิว (${queueData.length})</h3>
                <button id="clear-queue-btn" class="button button-secondary clear-queue-btn">🗑️ Clear All</button>
            </div>
            <div id="queue-list" class="queue-list"></div>
        `;
        
        queueListWrapper.innerHTML = headerHtml;
        
        // Get the new queue list element
        const newQueueList = document.getElementById('queue-list');
        
        // Render queue items
        queueData.forEach(item => {
            const queueItem = createQueueItemElement(item);
            newQueueList.appendChild(queueItem);
        });
        
        // Attach event listener to Clear All button
        clearQueueBtn = document.getElementById('clear-queue-btn');
        if (clearQueueBtn) {
            clearQueueBtn.addEventListener('click', clearQueue);
        }
    }

    // Create queue item element
    function createQueueItemElement(item) {
        const div = document.createElement('div');
        div.className = 'queue-item';
        div.dataset.id = item.id;

        const statusClass = `status-${item.status.toLowerCase()}`;
        const statusText = getStatusText(item.status);
        
        // Determine thumbnail source
        const thumbnailSrc = item.thumbnail || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="90"%3E%3Crect fill="%23dee2e6" width="120" height="90"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%236c757d" font-family="sans-serif" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';

        div.innerHTML = `
            <img src="${thumbnailSrc}" alt="${item.title}" class="queue-item-thumbnail" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2290%22%3E%3Crect fill=%22%23dee2e6%22 width=%22120%22 height=%2290%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%236c757d%22 font-family=%22sans-serif%22 font-size=%2214%22%3ENo Image%3C/text%3E%3C/svg%3E'">
            <div class="queue-item-info">
                <div class="queue-item-title">${item.title}</div>
                <div class="queue-item-url">${item.url}</div>
                <div class="queue-item-status">
                    <span class="status-badge ${statusClass}">${statusText}</span>
                    ${item.progress > 0 ? `<span>${item.progress}%</span>` : ''}
                </div>
                ${item.progress > 0 ? `
                    <div class="queue-item-progress">
                        <div class="queue-item-progress-bar" style="width: ${item.progress}%"></div>
                    </div>
                ` : ''}
                ${item.error ? `<div style="color: #721c24; font-size: 0.85rem;">❌ ${item.error}</div>` : ''}
            </div>
        `;

        return div;
    }

    // Get status text in Thai
    function getStatusText(status) {
        const statusMap = {
            'PENDING': 'รอดำเนินการ',
            'DOWNLOADING': 'กำลังดาวน์โหลด',
            'PAUSED': 'หยุดชั่วคราว',
            'FAILED': 'ล้มเหลว',
            'COMPLETED': 'สำเร็จ'
        };
        return statusMap[status] || status;
    }

    // Show loading state
    function showLoadingState(message) {
        const loadingHtml = `
            <div class="queue-loading">
                <div class="queue-loading-spinner"></div>
                <div class="queue-loading-text">${message}</div>
            </div>
        `;
        queueListWrapper.innerHTML = loadingHtml;
    }

    // Hide loading state
    function hideLoadingState() {
        // Will be replaced by renderQueue()
    }

    // Add URL(s) to queue and start downloading immediately
    async function addToQueue() {
        const urlsText = queueUrlInput.value.trim();
        
        if (!urlsText) {
            alert('กรุณาใส่ URL ของวิดีโอ');
            return;
        }

        // Split by comma or newline, then filter out empty strings
        const urls = urlsText.split(/[,\n]+/).map(url => url.trim()).filter(url => url !== '');

        if (urls.length === 0) {
            alert('ไม่พบ URL ที่ถูกต้อง');
            return;
        }

        // Log URLs being added
        logToServer('info', `[Add to Queue] User clicked add button with ${urls.length} URLs`, { 
            urls: urls,
            urlCount: urls.length 
        });

        // Validate all URLs
        const invalidUrls = urls.filter(url => !url.startsWith('http://') && !url.startsWith('https://'));
        if (invalidUrls.length > 0) {
            logToServer('warn', `[Add to Queue] Invalid URLs detected`, { 
                invalidUrls: invalidUrls,
                invalidCount: invalidUrls.length 
            });
            alert(`URL ต้องขึ้นต้นด้วย http:// หรือ https://\nURL ที่ไม่ถูกต้อง: ${invalidUrls[0]}`);
            return;
        }

        // Show loading state
        addToQueueBtn.disabled = true;
        addToQueueBtn.classList.add('loading');
        showLoadingState(`กำลังเพิ่ม ${urls.length} รายการเข้าคิว...`);

        let successCount = 0;
        let failedUrls = [];
        let queuedItems = []; // Store successfully queued items

        // Add each URL to queue first
        logToServer('info', `[Add to Queue] Starting to process ${urls.length} URLs`, { urls });
        
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            logToServer('info', `[Add to Queue] Processing URL ${i + 1}/${urls.length}`, { url, index: i });
            
            try {
                const response = await fetch('http://localhost:3000/api/queue', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url })
                });

                const data = await response.json();

                if (data.success) {
                    successCount++;
                    queuedItems.push(data.item);
                    logToServer('info', `[Add to Queue] Successfully added URL ${i + 1}/${urls.length}`, { 
                        url, 
                        id: data.item.id,
                        successCount 
                    });
                } else {
                    failedUrls.push({ url, error: data.error });
                    logToServer('error', `[Add to Queue] Failed to add URL ${i + 1}/${urls.length}`, { 
                        url, 
                        error: data.error,
                        statusCode: response.status
                    });
                }
            } catch (error) {
                failedUrls.push({ url, error: error.message });
                logToServer('error', `[Add to Queue] Exception while adding URL ${i + 1}/${urls.length}`, { 
                    url, 
                    error: error.message,
                    stack: error.stack
                });
            }
        }
        
        logToServer('info', `[Add to Queue] Finished processing all URLs`, { 
            total: urls.length,
            success: successCount,
            failed: failedUrls.length,
            failedUrls: failedUrls.map(f => f.url)
        });

        // Hide loading and reload queue
        hideLoadingState();
        await loadQueue();

        // Show results
        if (failedUrls.length === 0) {
            queueUrlInput.value = ''; // Clear input only if all succeeded
        } else {
            // Keep failed URLs in textarea
            queueUrlInput.value = failedUrls.map(f => f.url).join('\n');
        }

        // Re-enable button
        addToQueueBtn.disabled = false;
        addToQueueBtn.classList.remove('loading');

        // Start downloading queued items immediately
        if (queuedItems.length > 0) {
            alert(`✅ เพิ่มเข้าคิวและเริ่มดาวน์โหลด ${successCount} รายการ!`);
            // TODO: Phase 2 - Start download from queue
        } else if (failedUrls.length > 0) {
            alert(`❌ ล้มเหลว ${failedUrls.length} รายการ\n\nURL ที่ล้มเหลวยังคงอยู่ในช่องกรอก`);
        }
    }

    // Clear all queue items
    async function clearQueue() {
        if (queueData.length === 0) {
            alert('ไม่มีรายการในคิว');
            return;
        }

        const confirmed = confirm(`คุณต้องการลบรายการทั้งหมด ${queueData.length} รายการใช่หรือไม่?`);
        if (!confirmed) {
            return;
        }

        try {
            clearQueueBtn.disabled = true;
            clearQueueBtn.classList.add('loading');

            const response = await fetch('http://localhost:3000/api/queue', {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                logToServer('info', 'Queue cleared successfully', { clearedCount: data.clearedCount });
                await loadQueue();
                alert(`✅ ลบคิวทั้งหมดสำเร็จ (${data.clearedCount} รายการ)`);
            } else {
                logToServer('error', 'Failed to clear queue', data);
                alert(`❌ ${data.error}`);
            }
        } catch (error) {
            logToServer('error', 'Error clearing queue', { error: error.message });
            alert('❌ เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            clearQueueBtn.disabled = false;
            clearQueueBtn.classList.remove('loading');
        }
    }

    // Event listener for add to queue button
    addToQueueBtn.addEventListener('click', addToQueue);

    // Allow Ctrl+Enter or Cmd+Enter to add to queue (Enter alone is for new line)
    queueUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            addToQueue();
        }
    });

    // Load queue on page load with loading indicator
    loadQueue(true);
});