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
    downloadBtn.addEventListener('click', () => {
        const urlsText = urlInput.value.trim();
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

        urls.forEach(url => downloadVideo(url.trim()));
        urlInput.value = ''; // Clear input after starting downloads
    });

    // Function to download a video from a URL
    function downloadVideo(url) {
        // ใช้ URL เป็น ID ชั่วคราวเพื่อติดตามสถานะ
        const uniqueId = `status-${Date.now()}-${Math.random()}`;
        const fileName = url.length > 50 ? url.substring(0, 50) + '...' : url;
        const statusElement = createStatusElement(fileName);
        const progressBar = statusElement.querySelector('.progress-bar');
        const statusText = statusElement.querySelector('span');

        // เชื่อมต่อกับ Backend ผ่าน Server-Sent Events
        const eventSource = new EventSource(`http://localhost:3000/download?url=${encodeURIComponent(url)}`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'start':
                    statusText.textContent = `[${data.message}] ${fileName}`;
                    break;
                case 'progress':
                    const percent = Math.round(data.percent);
                    progressBar.style.width = `${percent}%`;
                    progressBar.textContent = `${percent}%`;
                    break;
                case 'done':
                    statusElement.className = 'download-status-item success';
                    statusElement.innerHTML = `✅ ดาวน์โหลด '${fileName}' สำเร็จ!`;
                    // Refresh the video list to show the new video
                    setTimeout(() => {
                        location.reload();
                    }, 2000);
                    eventSource.close(); // ปิดการเชื่อมต่อเมื่อเสร็จสิ้น
                    break;
                case 'error':
                    statusElement.className = 'download-status-item error';
                    statusElement.innerHTML = `❌ เกิดข้อผิดพลาดในการดาวน์โหลด '${fileName}': ${data.message}`;
                    eventSource.close();
                    break;
            }
        };

        eventSource.onerror = (err) => {
            console.error("EventSource failed:", err);
            statusElement.className = 'download-status-item error';
            statusElement.innerHTML = `❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ดาวน์โหลดได้`;
            eventSource.close();
        };
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