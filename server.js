const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// Logging system
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'server.log');

function writeLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    const fullLogEntry = data ? `${logEntry} ${JSON.stringify(data)}` : logEntry;
    
    // Write to file
    fs.appendFileSync(logFile, fullLogEntry + '\n');
    
    // Also write to console for development
    console.log(fullLogEntry);
}

function logInfo(message, data = null) {
    writeLog('INFO', message, data);
}

function logError(message, data = null) {
    writeLog('ERROR', message, data);
}

function logWarn(message, data = null) {
    writeLog('WARN', message, data);
}

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

// Initialize yt-dlp with fallback paths
const ytDlpPaths = [
    '/opt/homebrew/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    'yt-dlp' // fallback to PATH
];

let ytDlpWrap;
for (const ytDlpPath of ytDlpPaths) {
    try {
        ytDlpWrap = new YTDlpWrap(ytDlpPath);
        logInfo('yt-dlp initialized', { path: ytDlpPath });
        break;
    } catch (error) {
        logWarn('Failed to initialize yt-dlp', { path: ytDlpPath, error: error.message });
    }
}

if (!ytDlpWrap) {
    logError('Failed to initialize yt-dlp with any path', { paths: ytDlpPaths });
    process.exit(1);
}

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
        logInfo('Updated videos.json with new video', { title: videoInfo.title });
    } catch (error) {
        logError('Error updating videos.json', { error: error.message });
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
        logInfo('Fetched video info', { title: videoInfo.title, url });
    } catch (error) {
        logError('Failed to get video info', { error: error.message, url });
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
    logInfo(`Starting download`, { downloadId, url, options });
    
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
        logError('Failed to create download process', { downloadId, url });
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'ไม่สามารถเริ่มการดาวโหลดได้ - yt-dlp process creation failed' 
        })}\n\n`);
        res.end();
        activeDownloads.delete(downloadId);
        return;
    }

    // Add process validation
    if (!downloadProcess.ytDlpProcess) {
        logError('yt-dlp process not available', { downloadId, url });
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'ไม่สามารถเริ่มการดาวโหลดได้ - yt-dlp process not available' 
        })}\n\n`);
        res.end();
        activeDownloads.delete(downloadId);
        return;
    }

    // Add timeout to prevent hanging
    const downloadTimeout = setTimeout(() => {
        logError('Download timeout after 5 minutes', { downloadId });
        if (downloadProcess && downloadProcess.ytDlpProcess) {
            downloadProcess.ytDlpProcess.kill('SIGTERM');
        }
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'การดาวโหลดใช้เวลานานเกินไป (5 นาที)' 
        })}\n\n`);
        res.end();
        activeDownloads.delete(downloadId);
    }, 300000); // 5 minutes timeout

    // Add progress monitoring to detect stuck downloads
    let lastProgressTime = Date.now();
    let lastProgressPercent = 0;
    const progressTimeout = setTimeout(() => {
        const timeSinceLastProgress = Date.now() - lastProgressTime;
        if (timeSinceLastProgress > 60000) { // 1 minute without progress
            logWarn('Download appears to be stuck', { 
                downloadId, 
                timeSinceLastProgress, 
                lastProgressPercent 
            });
        }
    }, 30000); // Check every 30 seconds

    // Send initial progress
    res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        percent: 0,
        message: 'กำลังเริ่มดาวโหลด...'
    })}\n\n`);
    
    // Use the 'progress' event for accurate progress reporting
    downloadProcess.on('progress', (progress) => {
        lastProgressTime = Date.now();
        lastProgressPercent = progress.percent;
        logInfo('Download progress', { downloadId, percent: progress.percent });
        res.write(`data: ${JSON.stringify({
            type: 'progress',
            percent: progress.percent,
            message: `กำลังดาวน์โหลด... ${progress.percent}%`
        })}\n\n`);
    });

    // Handle process events
    downloadProcess.on('error', (error) => {
        logError('Download process error', { downloadId, error: error.message, stack: error.stack });
        clearTimeout(downloadTimeout);
        clearTimeout(progressTimeout);
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: `เกิดข้อผิดพลาดในการดาวโหลด: ${error.message}` 
        })}\n\n`);
        res.end();
        activeDownloads.delete(downloadId);
    });

    // Handle stderr output for better error reporting
    if (downloadProcess.ytDlpProcess && downloadProcess.ytDlpProcess.stderr) {
        downloadProcess.ytDlpProcess.stderr.on('data', (data) => {
            const errorOutput = data.toString();
            if (errorOutput.trim()) {
                logWarn('yt-dlp stderr output', { downloadId, stderr: errorOutput.trim() });
            }
        });
    }

    downloadProcess.on('close', (code) => {
        logInfo('Download process exited', { downloadId, exitCode: code });
        clearTimeout(downloadTimeout);
        clearTimeout(progressTimeout);
        
        // Handle different exit codes
        if (code === 0 || code === null) {
            // Download successful (0) or process terminated normally (null)
            try {
                // Find the downloaded file with improved detection
                const expectedFileNameStart = sanitizedTitle;
                const files = fs.readdirSync(videosDir);
                
                // Log all files for debugging
                logInfo('Files in videos directory', { downloadId, files: files.slice(0, 10) }); // Log first 10 files
                
                // Try multiple patterns to find the video file
                let videoFile = files.find(file => 
                    file.startsWith(expectedFileNameStart) && (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
                );
                
                // If not found, try to find any recent video file
                if (!videoFile) {
                    const recentFiles = files.filter(file => 
                        (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv')) &&
                        !file.includes('thumbnail')
                    );
                    
                    if (recentFiles.length > 0) {
                        // Get the most recently modified file
                        const stats = recentFiles.map(file => ({
                            name: file,
                            mtime: fs.statSync(path.join(videosDir, file)).mtime
                        }));
                        stats.sort((a, b) => b.mtime - a.mtime);
                        videoFile = stats[0].name;
                        logInfo('Using most recent video file', { downloadId, fileName: videoFile });
                    }
                }
                
                if (videoFile) {
                    const relativePath = `videos/${encodeURIComponent(videoFile)}`;
                    videoInfo.filePath = relativePath;
                    // Update videos.json
                    updateVideosJson(videoInfo);
                    
                    logInfo('Download completed successfully', { downloadId, fileName: videoFile });
                    res.write(`data: ${JSON.stringify({ 
                        type: 'done', 
                        message: 'ดาวโหลดสำเร็จ!',
                        filePath: relativePath,
                        title: videoInfo.title
                    })}\n\n`);
                } else {
                    logError('Downloaded file not found', { 
                        downloadId, 
                        expectedFileName: expectedFileNameStart,
                        availableFiles: files.filter(f => f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv'))
                    });
                    res.write(`data: ${JSON.stringify({ 
                        type: 'error', 
                        message: 'ไม่พบไฟล์วิดีโอที่ดาวโหลด' 
                    })}\n\n`);
                }
            } catch (error) {
                logError('Error processing completed download', { downloadId, error: error.message });
                res.write(`data: ${JSON.stringify({ 
                    type: 'error', 
                    message: `เกิดข้อผิดพลาด: ${error.message}` 
                })}\n\n`);
            }
        } else {
            // Download failed with non-zero exit code
            logError('Download failed with exit code', { downloadId, exitCode: code });
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
    logInfo('Backend server started', { 
        port: PORT, 
        staticPath: path.join(__dirname, 'src'),
        videosPath: path.join(__dirname, 'src', 'videos'),
        serverLogFile: logFile,
        frontendLogFile: path.join(__dirname, 'logs', 'frontend.log')
    });
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📁 Serving static files from: ${path.join(__dirname, 'src')}`);
    console.log(`🎥 Video downloads will be saved to: ${path.join(__dirname, 'src', 'videos')}`);
    console.log(`📝 Server logs will be saved to: ${logFile}`);
    console.log(`📝 Frontend logs will be saved to: ${path.join(__dirname, 'logs', 'frontend.log')}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logInfo('Server shutting down gracefully');
    console.log('\n🛑 Shutting down server...');
    
    // Kill all active downloads
    activeDownloads.forEach((download, id) => {
        if (download.process) {
            download.process.ytDlpProcess.kill();
        }
    });
    
    process.exit(0);
});
