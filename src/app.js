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
    async function downloadVideo(url) {
        const fileName = url.substring(url.lastIndexOf('/') + 1);
        const statusElement = createStatusElement(fileName);
        const progressBar = statusElement.querySelector('.progress-bar');

        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`ดาวน์โหลดล้มเหลว: ${response.status} ${response.statusText}`);
            }

            const contentLength = response.headers.get('content-length');
            if (!contentLength) {
                console.warn('ไม่สามารถหาขนาดไฟล์ได้ จะไม่แสดงสถานะการดาวน์โหลด');
            }

            const total = parseInt(contentLength, 10);
            let loaded = 0;

            const reader = response.body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                chunks.push(value);
                loaded += value.length;

                if (total) {
                    const percent = Math.round((loaded / total) * 100);
                    progressBar.style.width = `${percent}%`;
                    progressBar.textContent = `${percent}%`;
                }
            }

            const blob = new Blob(chunks);
            const blobUrl = URL.createObjectURL(blob);

            // Add the new video to our list
            const newVideo = {
                title: fileName || 'Untitled Video',
                description: `Downloaded from: ${url}`,
                filePath: blobUrl
            };
            videos.push(newVideo);
            renderVideoList(); // Re-render the list to show the new video

            statusElement.textContent = `✅ ดาวน์โหลด '${fileName}' สำเร็จ!`;
            statusElement.style.color = 'green';

        } catch (error) {
            console.error('Download error:', error);
            statusElement.textContent = `❌ เกิดข้อผิดพลาดในการดาวน์โหลด '${fileName}': ${error.message}`;
            statusElement.style.color = 'red';
        }
    }

    // Function to create a status element for a download
    function createStatusElement(fileName) {
        const statusElement = document.createElement('div');
        statusElement.innerHTML = `
            <span>กำลังดาวน์โหลด: ${fileName}</span>
            <div class="progress-bar-container"><div class="progress-bar">0%</div></div>
        `;
        downloadStatusContainer.appendChild(statusElement);
        return statusElement;
    }
});