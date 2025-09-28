const videoContainer = document.getElementById('video-container');
const videoList = document.getElementById('video-list');

// Fetch video data from videos.json
fetch('./data/videos.json')
    .then(response => response.json())
    .then(data => {
        displayVideos(data);
    })
    .catch(error => {
        console.error('Error fetching video data:', error);
    });

// Function to display videos
function displayVideos(videos) {
    videos.forEach(video => {
        const videoItem = document.createElement('div');
        videoItem.classList.add('video-item');

        const videoTitle = document.createElement('h3');
        videoTitle.textContent = video.title;

        const videoDescription = document.createElement('p');
        videoDescription.textContent = video.description;

        const videoElement = document.createElement('video');
        videoElement.src = video.filePath;
        videoElement.controls = true;

        videoItem.appendChild(videoTitle);
        videoItem.appendChild(videoDescription);
        videoItem.appendChild(videoElement);
        videoContainer.appendChild(videoItem);
    });
}