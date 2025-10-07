document.addEventListener('DOMContentLoaded', () => {
    const videoPlayer = document.getElementById('main-video-player');
    const videoTitle = document.getElementById('video-title');
    const videoDescription = document.getElementById('video-description');
    const videoListContainer = document.getElementById('video-list');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const urlInput = document.getElementById('url-input');
    const downloadBtn = document.getElementById('download-btn');
    const downloadStatusContainer = document.getElementById('download-status-container');

    let videos = [];
    let currentVideoIndex = 0;
    let activeDownloads = new Set(); // For tracking incomplete downloads

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

    // Event listener for the download button
    downloadBtn.addEventListener('click', async () => {
        let urlsText = urlInput.value.trim();
        if (!urlsText) {
            alert('กรุณาใส่ URL ของวิดีโอ');
            return;
        }

        // Split by comma or newline, then filter out empty strings
        const urls = urlsText.split(/[,]+/).filter(url => url.trim() !== '');

        if (urls.length === 0) {
            alert('ไม่พบ URL ที่ถูกต้อง');
            return;
        }

        // Disable button to prevent multiple clicks
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'กำลังดาวน์โหลด...';

        let completedCount = 0;
        const totalDownloads = urls.length;
        const batchId = `batch-${Date.now()}`;
        logToServer('info', `[Batch Start] ID: ${batchId}. Starting downloads for ${totalDownloads} URLs.`);

        const onDownloadComplete = () => {
            completedCount++;
            logToServer('info', `[Batch Progress] ID: ${batchId}. ${completedCount} of ${totalDownloads} downloads processed.`);
        };

        const downloadPromises = urls.map(url => downloadVideo(url.trim(), onDownloadComplete));

        try {
            const results = await Promise.allSettled(downloadPromises);

            logToServer('info', `[Batch End] ID: ${batchId}. All downloads processed.`);

            const failedUrls = results
                .map((result, index) => { // This part runs only after ALL downloads are settled.
                    if (result.status === 'rejected') {
                        // The 'end session' log for each download is now handled inside downloadVideo's promise.
                        // This log remains as a final summary.
                        logToServer('error', `[Batch Summary] ID: ${batchId}. Download failed for URL: ${urls[index]}`, { reason: result.reason.message });
                        return urls[index]; // Return the original URL that failed
                    } else {
                        logToServer('info', `[Batch Summary] ID: ${batchId}. Download finished for URL: ${urls[index]}`);
                        return null;
                    }
                })
                .filter(url => url !== null);

            // Update textarea with failed URLs
            urlInput.value = failedUrls.join('\n');
        } finally {
            // Re-enable button
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'ดาวน์โหลดวิดีโอ';
        }
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

    // Function to download a video from a URL with retry mechanism
    function downloadVideo(url, onCompleteCallback) {
        return new Promise((resolve, reject) => {
            const MAX_RETRIES = 5;
            let retryCount = 0;
            let timeoutId;

            const fileName = url.length > 50 ? url.substring(0, 50) + '...' : url;
            const statusElement = createStatusElement(fileName);
            const progressBar = statusElement.querySelector('.progress-bar');
            const statusText = statusElement.querySelector('span');
            const cancelBtn = statusElement.querySelector('.cancel-btn');

            // Generate a unique download ID for this session
            const downloadId = `frontend-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            activeDownloads.add(downloadId); // Add to active set

            logToServer('info', `[Session Start] Download session started for URL: ${url}`, { downloadId });

            let eventSource;

            cancelBtn.addEventListener('click', () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                if (eventSource) {
                    eventSource.close();
                }

                // Also call the cancel endpoint on the server
                const backendDownloadId = `backend-${downloadId}`;
                fetch(`http://localhost:3000/downloads/${backendDownloadId}/cancel`, {
                    method: 'POST'
                })
                .then(response => response.json())
                .then(data => logToServer('info', 'Sent cancel request to server.', data))
                .catch(err => console.error('Failed to send cancel request to server:', err));

                logToServer('warn', `[Cancelled] Download cancelled by user for URL: ${url}`, { downloadId });
                statusElement.className = 'download-status-item error';
                statusElement.innerHTML = `❌ ยกเลิกการดาวน์โหลด '${fileName}'`;
                activeDownloads.delete(downloadId);
                if (onCompleteCallback) onCompleteCallback();
                reject(new Error('Download cancelled by user'));
            });

            function attemptDownload() {
                if (retryCount > 0) {
                    statusText.textContent = `[ลองใหม่ครั้งที่ ${retryCount}/${MAX_RETRIES}] ${fileName}`;
                }

                eventSource = new EventSource(`http://localhost:3000/download?url=${encodeURIComponent(url)}&downloadId=${downloadId}`);

                const handleFailure = (errorMessage) => {
                    eventSource.close();
                    retryCount++;
                    if (retryCount <= MAX_RETRIES) {
                        logToServer('warn', `[EventSource] [${downloadId}] Download failed for ${url}. Retrying... (${retryCount}/${MAX_RETRIES})`, { error: errorMessage });
                        const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                        statusText.textContent = `[ล้มเหลว] ${fileName} - จะลองใหม่ใน ${retryDelay / 1000} วินาที...`;
                        timeoutId = setTimeout(attemptDownload, retryDelay);
                    } else {
                        logToServer('error', `[EventSource] [${downloadId}] Download failed for ${url} after ${MAX_RETRIES} retries.`, { error: errorMessage });
                        statusElement.className = 'download-status-item error';
                        statusElement.innerHTML = `❌ ดาวน์โหลด '${fileName}' ล้มเหลว: ${errorMessage}`;
                        logToServer('error', `[Session End] Download session ended with permanent failure for URL: ${url}`);
                        activeDownloads.delete(downloadId); // Remove from active set
                        if (onCompleteCallback) onCompleteCallback();
                        reject(new Error(errorMessage));
                    }
                };

                eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);

                        switch (data.type) {
                            case 'start':
                                logToServer('info', `[EventSource] [${downloadId}] Start event for ${url}`, data.message);
                                statusText.textContent = `[${data.message}] ${fileName}`;
                                break;
                            case 'progress':
                                const percent = Math.round(data.percent);
                                logToServer('info', `[Progress] [${downloadId}] ${percent}% for ${url}`);
                                progressBar.style.width = `${percent}%`;
                                progressBar.textContent = `${data.message} ${percent}%`;
                                statusText.textContent = `${fileName}`;
                                break;
                            case 'done':
                                logToServer('info', `[EventSource] [${downloadId}] Done event for ${url}`, data);
                                statusElement.className = 'download-status-item success';
                                statusElement.innerHTML = `✅ ดาวน์โหลด '${data.title || fileName}' สำเร็จ!`;
                                eventSource.close();
                                // Refresh the video list to show the new video
                                logToServer('info', `[Session End] Download session finished successfully for URL: ${url}`);
                                setTimeout(() => location.reload(), 2000);
                                activeDownloads.delete(downloadId); // Remove from active set
                                if (onCompleteCallback) onCompleteCallback();
                                resolve(url); // Success
                                break;
                            case 'error':
                                logToServer('error', `[EventSource] [${downloadId}] Error event for ${url}`, data.message);
                                handleFailure(data.message);
                                break;
                            default:
                                logToServer('warn', `[EventSource] [${downloadId}] Unknown event type for ${url}`, data.type);
                                break;
                        }
                    } catch (parseError) {
                        logToServer('error', `[EventSource] [${downloadId}] Failed to parse message for ${url}`, parseError.message);
                        handleFailure('ข้อมูลที่ได้รับจากเซิร์ฟเวอร์ไม่ถูกต้อง');
                    }
                };

                eventSource.onerror = (err) => {
                    logToServer('error', `[EventSource] [${downloadId}] Connection error for ${url}`, err);
                    handleFailure('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
                };

                eventSource.onopen = () => {
                    logToServer('info', `[EventSource] [${downloadId}] Connection opened for: ${url}`);
                };
            }

            attemptDownload();
        });
    }


    // Function to create a status element for a download
    function createStatusElement(fileName) {
        const statusElement = document.createElement('div');
        statusElement.className = 'download-status-item';
        statusElement.innerHTML = `
            <span>กำลังดาวน์โหลด: ${fileName}</span>
            <div class="progress-section">
                <div class="progress-bar-container"><div class="progress-bar">0%</div></div>
                <button class="cancel-btn button">ยกเลิก</button>
            </div>
        `;
        downloadStatusContainer.appendChild(statusElement);
        return statusElement;
    }
});