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

        // Disconnect from SSE on page unload
        disconnectFromQueueEvents();
    });

    // Function to load videos
    function loadVideos() {
        fetch('./data/videos.json')
            .then(response => response.json())
            .then(data => {
                videos = data;
                if (videos.length > 0) {
                    renderVideoList();
                    if (currentVideoIndex === 0 && !videoPlayer.src) {
                        playVideo(0);
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching video data:', error);
                videoListContainer.textContent = 'ไม่สามารถโหลดรายการวิดีโอได้';
            });
    }

    // Initial load
    loadVideos();

    // Function to render the list of videos
    function renderVideoList() {
        videoListContainer.innerHTML = ''; // Clear existing list
        videos.forEach((video, index) => {
            const videoItem = document.createElement('div');
            videoItem.classList.add('video-list-item');
            
            // Create thumbnail image
            const thumbnail = document.createElement('img');
            thumbnail.classList.add('video-list-thumbnail');
            thumbnail.src = video.thumbnail || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="90"%3E%3Crect fill="%23dee2e6" width="120" height="90"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%236c757d" font-family="sans-serif" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';
            thumbnail.alt = video.title;
            thumbnail.onerror = function() {
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="90"%3E%3Crect fill="%23dee2e6" width="120" height="90"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%236c757d" font-family="sans-serif" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';
            };
            
            // Create title element
            const titleElement = document.createElement('div');
            titleElement.classList.add('video-list-title');
            titleElement.textContent = video.title;
            
            videoItem.appendChild(thumbnail);
            videoItem.appendChild(titleElement);
            
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

    let queueEventSource = null;

    // Connect to SSE for real-time queue updates
    function connectToQueueEvents() {
        if (queueEventSource) {
            queueEventSource.close();
        }

        queueEventSource = new EventSource('http://localhost:3000/api/queue/events');

        queueEventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleQueueEvent(data);
            } catch (error) {
                console.error('Error parsing SSE message:', error);
            }
        };

        queueEventSource.onerror = (error) => {
            console.error('SSE connection error:', error);
        };

        queueEventSource.onopen = () => {
            logToServer('info', 'Connected to queue events SSE');
        };
    }

    // Handle queue events from SSE
    function handleQueueEvent(eventData) {
        switch (eventData.type) {
            case 'connected':
                logToServer('info', 'Connected to queue events');
                break;

            case 'queue_updated':
                handleQueueUpdate(eventData);
                break;

            default:
                logToServer('info', 'Unknown queue event type', { type: eventData.type });
        }
    }

    // Handle queue update events
    function handleQueueUpdate(eventData) {
        const { action, item } = eventData;

        switch (action) {
            case 'item_started':
                logToServer('info', 'Queue item started', { id: item.id });
                updateQueueItemStatus(item.id, 'DOWNLOADING');
                break;

            case 'progress':
                updateQueueItemProgress(item.id, item.progress);
                break;

            case 'item_completed':
                logToServer('info', 'Queue item completed', { id: item.id });
                updateQueueItemStatus(item.id, 'COMPLETED');

                // Reload videos if new item completed
                loadVideos();
                break;

            case 'item_failed':
                logToServer('error', 'Queue item failed', { id: item.id, error: item.error });
                updateQueueItemStatus(item.id, 'FAILED', item.error);
                break;

            default:
                logToServer('info', 'Unknown queue update action', { action });
        }
    }

    // Disconnect from SSE
    function disconnectFromQueueEvents() {
        if (queueEventSource) {
            queueEventSource.close();
            queueEventSource = null;
        }
    }

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
                </div>
                ${item.progress > 0 || item.status === 'DOWNLOADING' ? `
                    <div class="queue-item-progress">
                        <div class="queue-progress-bar" style="width: ${item.progress}%">${item.progress}%</div>
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

        // Use batch API for all cases (supports single or multiple URLs)
        logToServer('info', `[Add to Queue] Sending batch request with ${urls.length} URL(s)`, { urls });
        
        let failedUrls = [];
        let queuedItems = [];
        let successCount = 0;
        
        try {
            const response = await fetch('http://localhost:3000/api/queue/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ urls })
            });

            const batchData = await response.json();
            
            if (!batchData.success) {
                throw new Error(batchData.error || 'Batch request failed');
            }
            
            logToServer('info', `[Add to Queue] Batch request completed`, { 
                total: batchData.summary.total,
                success: batchData.summary.success,
                failed: batchData.summary.failed
            });
            
            // Process batch results
            failedUrls = batchData.results.filter(r => !r.success);
            queuedItems = batchData.results.filter(r => r.success).map(r => r.item);
            successCount = batchData.summary.success;
            
        } catch (error) {
            logToServer('error', `[Add to Queue] Batch request error`, { 
                error: error.message,
                stack: error.stack
            });
            alert('❌ เกิดข้อผิดพลาด: ' + error.message);
            addToQueueBtn.disabled = false;
            addToQueueBtn.classList.remove('loading');
            return;
        }

        // Hide loading (no reload needed - items already in queuedItems)
        hideLoadingState();

        // Show results
        if (failedUrls.length === 0) {
            queueUrlInput.value = ''; // Clear input only if all succeeded
        } else {
            // Keep failed URLs in textarea
            queueUrlInput.value = failedUrls.map(f => f.url).join('\n');
        }

        // Render queue items directly (no reload)
        queueData = [...queueData, ...queuedItems];
        renderQueue();

        // Re-enable button
        addToQueueBtn.disabled = false;
        addToQueueBtn.classList.remove('loading');

        // Start downloading only the FIRST item (one at a time)
        if (queuedItems.length > 0) {
            logToServer('info', `[Add to Queue] Will start downloading FIRST item only`, { 
                firstItem: { id: queuedItems[0].id, title: queuedItems[0].title },
                totalInQueue: queuedItems.length
            });
            
            alert(`✅ เพิ่มเข้าคิว ${successCount} รายการ! กำลังเริ่มดาวน์โหลดคลิปแรก...`);
            
            // Start downloading only the first item
            const firstItem = queuedItems[0];
            logToServer('info', `[Add to Queue] Starting download for first item`, { 
                id: firstItem.id, 
                title: firstItem.title 
            });
            await startDownload(firstItem.id);
            
            logToServer('info', `[Add to Queue] First download started. Remaining items will be downloaded manually.`, { 
                started: 1,
                remaining: queuedItems.length - 1
            });
        } else if (failedUrls.length > 0) {
            alert(`❌ ล้มเหลว ${failedUrls.length} รายการ\n\nURL ที่ล้มเหลวยังคงอยู่ในช่องกรอก`);
        }
    }

    // Start download for a queue item with SSE progress
    async function startDownload(queueId) {
        return new Promise((resolve, reject) => {
            logToServer('info', `[Start Download] Starting SSE stream for queue item`, { queueId });
            
            const eventSource = new EventSource(`http://localhost:3000/api/queue/${queueId}/download-stream`);
            
            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    switch (data.type) {
                        case 'start':
                            logToServer('info', `[Start Download] Download started`, { queueId });
                            updateQueueItemStatus(queueId, 'DOWNLOADING');
                            break;
                            
                        case 'progress':
                            // Update progress bar in real-time (no reload)
                            updateQueueItemProgress(queueId, data.percent);
                            break;
                            
                        case 'done':
                            logToServer('info', `[Start Download] Download completed`, { queueId, title: data.title });
                            eventSource.close();
                            updateQueueItemStatus(queueId, 'COMPLETED');
                            loadVideos(); // Reload video list to show new video
                            resolve();
                            break;
                            
                        case 'error':
                            logToServer('error', `[Start Download] Download error`, { queueId, error: data.message });
                            eventSource.close();
                            updateQueueItemStatus(queueId, 'FAILED', data.message);
                            reject(new Error(data.message));
                            break;
                    }
                } catch (parseError) {
                    logToServer('error', `[Start Download] Failed to parse SSE message`, { queueId, error: parseError.message });
                }
            };
            
            eventSource.onerror = (error) => {
                logToServer('error', `[Start Download] SSE connection error`, { queueId });
                eventSource.close();
                reject(error);
            };
        });
    }
    
    // Update queue item progress in UI (real-time, no reload)
    function updateQueueItemProgress(queueId, percent) {
        const queueItem = document.querySelector(`[data-id="${queueId}"]`);
        if (!queueItem) return;
        
        // Update or create progress bar
        let progressContainer = queueItem.querySelector('.queue-item-progress');
        if (!progressContainer) {
            // Create progress bar if it doesn't exist
            const infoDiv = queueItem.querySelector('.queue-item-info');
            progressContainer = document.createElement('div');
            progressContainer.className = 'queue-item-progress';
            progressContainer.innerHTML = '<div class="queue-progress-bar" style="width: 0%">0%</div>';
            infoDiv.appendChild(progressContainer);
        }
        
        const progressBar = progressContainer.querySelector('.queue-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.textContent = `${percent}%`;
        }
        
        // Update status text to show percent
        const statusBadge = queueItem.querySelector('.queue-item-status');
        if (statusBadge) {
            const percentSpan = statusBadge.querySelector('span:last-child');
            if (percentSpan && !percentSpan.classList.contains('status-badge')) {
                percentSpan.textContent = `${percent}%`;
            } else if (!percentSpan) {
                const newSpan = document.createElement('span');
                newSpan.textContent = `${percent}%`;
                statusBadge.appendChild(newSpan);
            }
        }
    }
    
    // Update queue item status in UI (real-time, no reload)
    function updateQueueItemStatus(queueId, status, errorMessage = null) {
        const queueItem = document.querySelector(`[data-id="${queueId}"]`);
        if (!queueItem) return;
        
        const statusBadge = queueItem.querySelector('.status-badge');
        if (statusBadge) {
            // Update status class
            statusBadge.className = `status-badge status-${status.toLowerCase()}`;
            statusBadge.textContent = getStatusText(status);
        }
        
        // Show/hide progress bar based on status
        const progressContainer = queueItem.querySelector('.queue-item-progress');
        if (status === 'COMPLETED' || status === 'FAILED') {
            if (progressContainer) {
                progressContainer.style.display = 'none';
            }
        }
        
        // Show error message if failed
        if (status === 'FAILED' && errorMessage) {
            const infoDiv = queueItem.querySelector('.queue-item-info');
            let errorDiv = infoDiv.querySelector('.error-message');
            if (!errorDiv) {
                errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.style.cssText = 'color: #721c24; font-size: 0.85rem; margin-top: 4px;';
                infoDiv.appendChild(errorDiv);
            }
            errorDiv.textContent = `❌ ${errorMessage}`;
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

    // Connect to queue events SSE
    connectToQueueEvents();
});