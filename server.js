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
const ytDlpWrap = new YTDlpWrap();

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
    const url = req.query.url;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Set headers for Server-Sent Events
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
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

    // Configure yt-dlp options
    const options = [
        '--output', path.join(videosDir, '%(title)s.%(ext)s'),
        '--format', 'best[height<=720]', // Limit to 720p for smaller file size
        '--no-playlist', // Download only single video, not playlist
        '--write-info-json', // Write metadata
        '--write-thumbnail', // Download thumbnail
        '--embed-thumbnail', // Embed thumbnail in video
        '--add-metadata', // Add metadata to video
        '--no-warnings', // Suppress warnings
        '--extract-flat', 'false' // Don't extract flat playlist
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

    downloadProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('yt-dlp output:', output);
        
        // Parse progress from yt-dlp output
        const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
        if (progressMatch) {
            const progress = parseFloat(progressMatch[1]);
            if (progress > lastProgress) {
                lastProgress = progress;
                res.write(`data: ${JSON.stringify({ 
                    type: 'progress', 
                    percent: progress,
                    message: `กำลังดาวโหลด... ${progress.toFixed(1)}%`
                })}\n\n`);
            }
        }

        // Parse video title
        const titleMatch = output.match(/\[download\] Destination: (.+)/);
        if (titleMatch) {
            const fileName = path.basename(titleMatch[1]);
            videoInfo.title = fileName.replace(/\.[^/.]+$/, ""); // Remove extension
        }
    });

    downloadProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.log('yt-dlp error:', error);
        
        // Check for errors
        if (error.includes('ERROR') || error.includes('error')) {
            res.write(`data: ${JSON.stringify({ 
                type: 'error', 
                message: error.trim() 
            })}\n\n`);
            res.end();
            activeDownloads.delete(downloadId);
            return;
        }
    });

    downloadProcess.on('close', (code) => {
        console.log(`Download process exited with code ${code}`);
        
        if (code === 0) {
            // Download successful
            try {
                // Find the downloaded file
                const files = fs.readdirSync(videosDir);
                const videoFile = files.find(file => 
                    file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv')
                );
                
                if (videoFile) {
                    const relativePath = `videos/${videoFile}`;
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
