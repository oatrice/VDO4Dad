const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('src'));

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

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
app.get('/download', async (req, res) => {
    const url = req.query.url;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Set headers for Server-Sent Events
    res.writeHead(200, {
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

    let videoInfo;
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
    const sanitizedTitle = videoInfo.title
        .replace(/\|/g, '｜') // Replace pipe with full-width pipe
        .replace(/[<>:"/\\?*]/g, ''); // Remove other invalid characters

    const outputPath = path.join(videosDir, `${sanitizedTitle}.%(ext)s`);

    // Configure yt-dlp options
    const options = [
        '--output', outputPath,
        // Prioritize MP4 format, up to 720p. Fallback to best available.
        '--format', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]',
        '--no-playlist', // Download only single video, not playlist
        '--write-thumbnail', // Download thumbnail
        '--merge-output-format', 'mp4', // Ensure the final file is mp4
        // Specify ffmpeg location to ensure merging works
        '--ffmpeg-location', ffmpegPath,
        '--no-warnings' // Suppress warnings
    ];

    // Start download
    const downloadProcess = ytDlpWrap.exec([
        url,
        ...options
    ]);

    // Store download info
    activeDownloads.set(downloadId, {
        process: downloadProcess, // This is the EventEmitter
        url: url,
        startTime: Date.now()
    });


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

    // Send initial progress
    res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        percent: 0,
        message: 'กำลังเริ่มดาวโหลด...'
    })}\n\n`);
    
    // Use the 'progress' event for accurate progress reporting
    downloadProcess.on('progress', (progress) => {
        res.write(`data: ${JSON.stringify({
            type: 'progress',
            percent: progress.percent,
            message: `กำลังดาวน์โหลด... ${progress.percent}%`
        })}\n\n`);
    });

    // Handle process events
    downloadProcess.on('error', (error) => {
        console.log('Download process error:', error);
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: `เกิดข้อผิดพลาด: ${error.message}` 
        })}\n\n`);
        res.end();
        activeDownloads.delete(downloadId);
    });

    downloadProcess.on('close', (code) => {
        console.log(`Download process exited with code ${code}`);
        
        if (code === 0) {
            // Download successful
            try {
                // Find the downloaded file
                const expectedFileNameStart = sanitizedTitle;
                const files = fs.readdirSync(videosDir);
                const videoFile = files.find(file => 
                    file.startsWith(expectedFileNameStart) && (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
                );
                
                if (videoFile) {
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
                download.process.ytDlpProcess.kill();
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
            download.process.ytDlpProcess.kill();
        }
        activeDownloads.delete(downloadId);
        res.json({ message: 'Download cancelled' });
    } else {
        res.status(404).json({ error: 'Download not found' });
    }
});

// Endpoint for receiving logs from the frontend
app.post('/log', (req, res) => {
    const { level, message, data } = req.body;
    const logFilePath = path.join(logsDir, 'frontend.log');
    const timestamp = new Date().toISOString();
    
    let logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    if (data) {
        // Stringify object data for better readability in the log file
        logEntry += ` | Data: ${typeof data === 'object' ? JSON.stringify(data) : data}\n`;
    } else {
        logEntry += '\n';
    }

    fs.appendFile(logFilePath, logEntry, (err) => { /* We don't need to handle error here for this case */ });
    res.sendStatus(204); // No Content
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
    console.log(`📝 Frontend logs will be saved to: ${path.join(__dirname, 'logs', 'frontend.log')}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    
    // Kill all active downloads
    activeDownloads.forEach((download, id) => {
        if (download.process) {
            download.process.ytDlpProcess.kill();
        }
    });
    
    process.exit(0);
});
