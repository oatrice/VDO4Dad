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
        const urls = urlsText.split(/[\n,]+/).filter(url => url.trim() !== '');
        
        if (urls.length === 0) {
            alert('ไม่พบ URL ที่ถูกต้อง');
            return;
        }

        // Disable button to prevent multiple clicks
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'กำลังดาวน์โหลด...';

        const downloadPromises = urls.map(url => downloadVideo(url.trim()));

        const results = await Promise.allSettled(downloadPromises);

        const failedUrls = results
            .map((result, index) => {
                if (result.status === 'rejected') {
                    return urls[index]; // Return the original URL that failed
                }
                return null;
            })
            .filter(url => url !== null);

        // Update textarea with failed URLs
        urlInput.value = failedUrls.join('\n');

        // Re-enable button
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'ดาวน์โหลดวิดีโอ';
    });

    // Function to send logs to the server
    function logToServer(level, message, data = null) {
        // Also log to console for real-time debugging in the browser
        console[level](message, data || '');

        fetch('http://localhost:3000/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level, message, data }),
        }).catch(err => console.error('Failed to send log to server:', err)); // Log failure to send log
    }

    // Function to download a video from a URL with retry mechanism
    function downloadVideo(url) {
        return new Promise((resolve, reject) => {
            const MAX_RETRIES = 5;
            let retryCount = 0;

            const fileName = url.length > 50 ? url.substring(0, 50) + '...' : url;
            const statusElement = createStatusElement(fileName);
            const progressBar = statusElement.querySelector('.progress-bar');
            const statusText = statusElement.querySelector('span');
            
            // Generate a unique download ID for this session
            const downloadId = `frontend-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            function attemptDownload() {
                if (retryCount > 0) {
                    statusText.textContent = `[ลองใหม่ครั้งที่ ${retryCount}/${MAX_RETRIES}] ${fileName}`;
                }

                const eventSource = new EventSource(`http://localhost:3000/download?url=${encodeURIComponent(url)}&downloadId=${downloadId}`);

                const handleFailure = (errorMessage) => {
                    eventSource.close();
                    retryCount++;
                    if (retryCount <= MAX_RETRIES) {
                        logToServer('warn', `[EventSource] [${downloadId}] Download failed for ${url}. Retrying... (${retryCount}/${MAX_RETRIES})`, { error: errorMessage });
                        const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                        statusText.textContent = `[ล้มเหลว] ${fileName} - จะลองใหม่ใน ${retryDelay / 1000} วินาที...`;
                        setTimeout(attemptDownload, retryDelay);
                    } else {
                        logToServer('error', `[EventSource] [${downloadId}] Download failed for ${url} after ${MAX_RETRIES} retries.`, { error: errorMessage });
                        statusElement.className = 'download-status-item error';
                        statusElement.innerHTML = `❌ ดาวน์โหลด '${fileName}' ล้มเหลว: ${errorMessage}`;
                        reject(new Error(errorMessage));
                    }
                };

                eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);

                        switch (data.type) {
                            case 'start':
                                logToServer('log', `[EventSource] [${downloadId}] Start event for ${url}`, data.message);
                                statusText.textContent = `[${data.message}] ${fileName}`;
                                break;
                            case 'progress':
                                const percent = Math.round(data.percent);
                                progressBar.style.width = `${percent}%`;
                                progressBar.textContent = `${percent}%`;
                                statusText.textContent = `[${data.message || 'กำลังดาวน์โหลด...'}] ${fileName} - ${percent}%`;
                                break;
                            case 'done':
                                logToServer('log', `[EventSource] [${downloadId}] Done event for ${url}`, data);
                                statusElement.className = 'download-status-item success';
                                statusElement.innerHTML = `✅ ดาวน์โหลด '${data.title || fileName}' สำเร็จ!`;
                                eventSource.close();
                                // Refresh the video list to show the new video
                                setTimeout(() => location.reload(), 2000);
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
                    logToServer('log', `[EventSource] [${downloadId}] Connection opened for: ${url}`);
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
            <div class="progress-bar-container"><div class="progress-bar">0%</div></div>
        `;
        downloadStatusContainer.appendChild(statusElement);
        return statusElement;
    }
});