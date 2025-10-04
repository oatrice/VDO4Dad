const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('src'));

// Initialize yt-dlp
const ytDlpWrap = new YTDlpWrap('/opt/homebrew/bin/yt-dlp');

// Store active downloads
const activeDownloads = new Map();

// Function to update videos.json with new video
function updateVideosJson(videoInfo) {
    const videosPath = path.join(__dirname, 'src', 'data', 'videos.json');
    
    try {
        let videos = [];
        if (fs.existsSync(videosPath)) {
            const data = fs.readFileSync(videosPath, 'utf8');
            videos = JSON.parse(data);
        }
        
        // Add new video to the beginning of the list
        videos.unshift({
            title: videoInfo.title || 'วิดีโอใหม่',
            description: videoInfo.description || 'วิดีโอที่ดาวโหลดใหม่',
            filePath: videoInfo.filePath
        });
        
        fs.writeFileSync(videosPath, JSON.stringify(videos, null, 4));
        console.log('Updated videos.json with new video:', videoInfo.title);
    } catch (error) {
        console.error('Error updating videos.json:', error);
    }
}

// Download endpoint with Server-Sent Events
app.get('/download', (req, res) => {
app.get('/download', async (req, res) => {
    const url = req.query.url;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Set headers for Server-Sent Events
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const downloadId = `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const videosDir = path.join(__dirname, 'src', 'videos');
    
    // Ensure videos directory exists
    if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
    }

    // Send initial message
    res.write(`data: ${JSON.stringify({ type: 'start', message: 'เริ่มดาวโหลด...' })}\n\n`);
    
    let videoInfo = {};
    try {
        // 1. Get video metadata first to get the correct title
        videoInfo = await ytDlpWrap.getVideoInfo(url);
        console.log('Fetched video info:', videoInfo.title);
    } catch (error) {
        console.error('Failed to get video info:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'ไม่สามารถดึงข้อมูลวิดีโอได้' })}\n\n`);
        res.end();
        return;
    }

    // Sanitize filename to prevent issues
    const sanitizedTitle = videoInfo.title.replace(/[<>:"/\\|?*]/g, '_');
    const outputPath = path.join(videosDir, `${sanitizedTitle}.%(ext)s`);

    // Configure yt-dlp options
    const options = [
        '--output', path.join(videosDir, '%(title)s.%(ext)s'),
        '--output', outputPath,
        '--format', 'best[height<=720]', // Limit to 720p for smaller file size
        '--no-playlist', // Download only single video, not playlist
        '--write-info-json', // Write metadata
        '--write-thumbnail', // Download thumbnail
        '--no-warnings' // Suppress warnings
    ];

    // Start download
    const downloadProcess = ytDlpWrap.exec([
        url,
        ...options
    ]);

    // Store download info
    activeDownloads.set(downloadId, {
        process: downloadProcess,
        url: url,
        startTime: Date.now()
    });

    let lastProgress = 0;
    let videoInfo = {};

    // Check if downloadProcess exists
    if (!downloadProcess) {
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'ไม่สามารถเริ่มการดาวโหลดได้' 
        })}\n\n`);
        res.end();
        activeDownloads.delete(downloadId);
        return;
    }

    // Set up progress tracking with polling
    let progressInterval;
    let downloadStartTime = Date.now();
    
    // Send initial progress
    res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        percent: 0,
        message: 'กำลังเริ่มดาวโหลด...'
    })}\n\n`);

    // Poll for progress by checking file size
    const checkProgress = () => {
        try {
            const files = fs.readdirSync(videosDir);
            const videoFiles = files.filter(file => 
                file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv')
            );
            
            if (videoFiles.length > 0) {
                const videoFile = videoFiles[0];
                const filePath = path.join(videosDir, videoFile);
                const stats = fs.statSync(filePath);
                const fileSizeMB = stats.size / (1024 * 1024);
                
                // Estimate progress based on time elapsed (rough estimate)
                const elapsedSeconds = (Date.now() - downloadStartTime) / 1000;
                let estimatedProgress = Math.min(95, (elapsedSeconds / 30) * 100); // Assume 30 seconds for typical video
                
                if (estimatedProgress > lastProgress) {
                    lastProgress = estimatedProgress;
                    res.write(`data: ${JSON.stringify({ 
                        type: 'progress', 
                        percent: estimatedProgress,
                        message: `กำลังดาวโหลด... ${estimatedProgress.toFixed(1)}% (${fileSizeMB.toFixed(1)} MB)`
                    })}\n\n`);
                }
                
                // Set video title from filename
                if (!videoInfo.title) {
                    videoInfo.title = videoFile.replace(/\.[^/.]+$/, ""); // Remove extension
                }
            }
        } catch (error) {
            // Ignore errors during progress checking
        }
    };

    // Start progress polling every 2 seconds
    progressInterval = setInterval(checkProgress, 2000);

    // Handle process events
    downloadProcess.on('error', (error) => {
        console.log('Download process error:', error);
        clearInterval(progressInterval);
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: `เกิดข้อผิดพลาด: ${error.message}` 
        })}\n\n`);
        res.end();
        activeDownloads.delete(downloadId);
    });

    downloadProcess.on('close', (code) => {
        console.log(`Download process exited with code ${code}`);
        clearInterval(progressInterval);
        
        if (code === 0) {
            // Download successful
            try {
                // Find the downloaded file
                const expectedFileNameStart = sanitizedTitle;
                const files = fs.readdirSync(videosDir);
                const videoFile = files.find(file => 
                    file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv')
                    file.startsWith(expectedFileNameStart) && (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
                );
                
                if (videoFile) {
                    const relativePath = `videos/${videoFile}`;
                    const relativePath = `videos/${encodeURIComponent(videoFile)}`;
                    videoInfo.filePath = relativePath;
                    
                    // Update videos.json
                    updateVideosJson(videoInfo);
                    
                    res.write(`data: ${JSON.stringify({ 
                        type: 'done', 
                        message: 'ดาวโหลดสำเร็จ!',
                        filePath: relativePath,
                        title: videoInfo.title
                    })}\n\n`);
                } else {
                    res.write(`data: ${JSON.stringify({ 
                        type: 'error', 
                        message: 'ไม่พบไฟล์วิดีโอที่ดาวโหลด' 
                    })}\n\n`);
                }
            } catch (error) {
                res.write(`data: ${JSON.stringify({ 
                    type: 'error', 
                    message: `เกิดข้อผิดพลาด: ${error.message}` 
                })}\n\n`);
            }
        } else {
            res.write(`data: ${JSON.stringify({ 
                type: 'error', 
                message: `การดาวโหลดล้มเหลว (exit code: ${code})` 
            })}\n\n`);
        }
        
        res.end();
        activeDownloads.delete(downloadId);
    });

    // Handle client disconnect
    req.on('close', () => {
        if (activeDownloads.has(downloadId)) {
            const download = activeDownloads.get(downloadId);
            if (download.process) {
                download.process.kill();
            }
            if (progressInterval) {
                clearInterval(progressInterval);
            }
            activeDownloads.delete(downloadId);
        }
    });
});

// Get download status endpoint
app.get('/downloads/status', (req, res) => {
    const status = Array.from(activeDownloads.entries()).map(([id, download]) => ({
        id,
        url: download.url,
        startTime: download.startTime,
        duration: Date.now() - download.startTime
    }));
    
    res.json({ downloads: status });
});

// Cancel download endpoint
app.post('/downloads/:id/cancel', (req, res) => {
    const downloadId = req.params.id;
    
    if (activeDownloads.has(downloadId)) {
        const download = activeDownloads.get(downloadId);
        if (download.process) {
            download.process.kill();
        }
        activeDownloads.delete(downloadId);
        res.json({ message: 'Download cancelled' });
    } else {
        res.status(404).json({ error: 'Download not found' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📁 Serving static files from: ${path.join(__dirname, 'src')}`);
    console.log(`🎥 Video downloads will be saved to: ${path.join(__dirname, 'src', 'videos')}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    
    // Kill all active downloads
    activeDownloads.forEach((download, id) => {
        if (download.process) {
            download.process.kill();
        }
    });
    
    process.exit(0);
});
