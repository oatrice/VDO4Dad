const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// Queue data file path
const QUEUE_DATA_FILE = path.join(__dirname, 'src', 'data', 'queue_data.json');

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

// Store pending cancellations (cancel requests that arrived before download started)
const pendingCancellations = new Set();

// Queue storage - stores all queue items with their status
let queueData = [];

// Queue item statuses
const QueueStatus = {
    PENDING: 'PENDING',
    DOWNLOADING: 'DOWNLOADING',
    PAUSED: 'PAUSED',
    FAILED: 'FAILED',
    COMPLETED: 'COMPLETED'
};

// Function to load queue data from file
function loadQueueData() {
    try {
        if (fs.existsSync(QUEUE_DATA_FILE)) {
            const data = fs.readFileSync(QUEUE_DATA_FILE, 'utf8');
            queueData = JSON.parse(data);
            logInfo('Queue data loaded from file', { itemCount: queueData.length });
            return queueData;
        } else {
            logInfo('No existing queue data file found, starting with empty queue');
            queueData = [];
            return queueData;
        }
    } catch (error) {
        logError('Failed to load queue data', { error: error.message });
        queueData = [];
        return queueData;
    }
}

// Function to save queue data to file
function saveQueueData() {
    try {
        fs.writeFileSync(QUEUE_DATA_FILE, JSON.stringify(queueData, null, 2), 'utf8');
        logInfo('Queue data saved to file', { itemCount: queueData.length });
    } catch (error) {
        logError('Failed to save queue data', { error: error.message });
    }
}

// Function to recover queue on server start
function recoverQueue() {
    logInfo('Starting queue recovery process');
    
    let recoveredCount = 0;
    queueData.forEach(item => {
        // Reset DOWNLOADING and PAUSED items to PENDING
        if (item.status === QueueStatus.DOWNLOADING || item.status === QueueStatus.PAUSED) {
            item.status = QueueStatus.PENDING;
            item.pid = null; // Clear process ID
            item.progress = 0; // Reset progress
            recoveredCount++;
            logInfo('Recovered queue item', { 
                id: item.id, 
                url: item.url, 
                previousStatus: item.status 
            });
        }
    });
    
    if (recoveredCount > 0) {
        saveQueueData();
        logInfo('Queue recovery completed', { recoveredCount });
    } else {
        logInfo('No items needed recovery');
    }
}

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
    const frontendDownloadId = req.query.downloadId;
    
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

    // Use frontend download ID if provided, otherwise generate new one
    const downloadId = frontendDownloadId ? `backend-${frontendDownloadId}` : `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const videosDir = path.join(__dirname, 'src', 'videos');
    let downloadStage = 'video';

    // Heartbeat to keep the connection alive
    const heartbeatInterval = setInterval(() => {
        res.write('event: ping\ndata: {}\n\n');
    }, 3000);
    
    // Log correlation between frontend and backend IDs
    if (frontendDownloadId) {
        logInfo('Download ID correlation', { frontendId: frontendDownloadId, backendId: downloadId, url });
    }
    
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
        '--format', 'bestvideo[height<=720][ext=mp4][protocol!=m3u8]+bestaudio[ext=m4a][protocol!=m3u8]/best[height<=720][ext=mp4][protocol!=m3u8]/best[height<=720][protocol!=m3u8]',
        '--no-playlist', // Download only single video, not playlist
        '--write-thumbnail', // Download thumbnail
        '--merge-output-format', 'mp4', // Ensure the final file is mp4
        // Specify ffmpeg location to ensure merging works
        '--ffmpeg-location', ffmpegPath,
        '--no-warnings', // Suppress warnings
        '--verbose', // Add verbose logging for debugging
        '--print-traffic', // Print HTTP traffic for debugging
        // Retries for resiliency
        '--retries', '10',
        '--fragment-retries', '10',
        '--retry-sleep', '1'
    ];

    // Start download
    logInfo(`Starting download`, { downloadId, url, options });
    
    // Check if this download was already cancelled before it started
    if (pendingCancellations.has(downloadId)) {
        logInfo('Download was pre-cancelled (cancel arrived before download started)', { downloadId });
        pendingCancellations.delete(downloadId);
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'การดาวโหลดถูกยกเลิก' 
        })}\n\n`);
        res.end();
        return;
    }
    
    // Reserve the download slot BEFORE starting the process to handle early cancellation
    activeDownloads.set(downloadId, {
        process: null, // Will be set after exec
        url: url,
        startTime: Date.now(),
        cancelled: false // Flag for early cancellation
    });
    
    // Log yt-dlp version and configuration
    try {
        const ytDlpVersion = await ytDlpWrap.getVersion();
        logInfo('yt-dlp version', { downloadId, version: ytDlpVersion });
    } catch (error) {
        logWarn('Failed to get yt-dlp version', { downloadId, error: error.message });
    }
    
    // Check if cancelled after async operation
    if (!activeDownloads.has(downloadId)) {
        logInfo('Download was cancelled during initialization (not in map)', { downloadId });
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'การดาวโหลดถูกยกเลิก' 
        })}\n\n`);
        res.end();
        return;
    }
    
    const downloadInfo = activeDownloads.get(downloadId);
    if (downloadInfo.cancelled) {
        logInfo('Download was cancelled during initialization (flag set)', { downloadId });
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'การดาวโหลดถูกยกเลิก' 
        })}\n\n`);
        res.end();
        activeDownloads.delete(downloadId);
        return;
    }
    
    const downloadProcess = ytDlpWrap.exec([
        url,
        ...options
    ]);

    // Check if downloadProcess exists
    if (!downloadProcess) {
        logError('Failed to create download process', { downloadId, url });
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'ไม่สามารถเริ่มการดาวโหลดได้ - yt-dlp process creation failed' 
        })}\n\n`);
        res.end();
        activeDownloads.delete(downloadId);
        
        // Add session separator
        logInfo('=== Download Session Ended (Error) ===', { downloadId, frontendId: frontendDownloadId });
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
        
        // Add session separator
        logInfo('=== Download Session Ended (Error) ===', { downloadId, frontendId: frontendDownloadId });
        return;
    }

    // Declare cleanup function and timers/intervals BEFORE using them
    let downloadTimeout, progressTimeout, processHealthInterval;
    
    const cleanup = () => {
        clearTimeout(downloadTimeout);
        clearTimeout(progressTimeout);
        clearInterval(processHealthInterval);
        clearInterval(heartbeatInterval);
    };

    // Update with actual process and cleanup function
    if (activeDownloads.has(downloadId)) {
        const downloadInfo = activeDownloads.get(downloadId);
        downloadInfo.process = downloadProcess;
        downloadInfo.cleanup = cleanup; // Store cleanup function for cancellation
    } else {
        // Was deleted (cancelled) while exec was starting
        logWarn('Download was cancelled during process creation', { downloadId });
        if (downloadProcess && downloadProcess.ytDlpProcess) {
            downloadProcess.ytDlpProcess.kill();
        }
        cleanup();
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'การดาวโหลดถูกยกเลิก' 
        })}\n\n`);
        res.end();
        return;
    }

    // Add timeout to prevent hanging
    downloadTimeout = setTimeout(() => {
        logError('Download timeout after 5 minutes', { downloadId });
        if (downloadProcess && downloadProcess.ytDlpProcess) {
            downloadProcess.ytDlpProcess.kill('SIGTERM');
        }
        cleanup();
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'การดาวโหลดใช้เวลานานเกินไป (5 นาที)' 
        })}\n\n`);
        res.end();
        activeDownloads.delete(downloadId);
        
        // Add session separator
        logInfo('=== Download Session Ended (Timeout) ===', { downloadId, frontendId: frontendDownloadId });
    }, 300000); // 5 minutes timeout

    // Add progress monitoring to detect stuck downloads
    let lastProgressTime = Date.now();
    let lastProgressPercent = 0;
    progressTimeout = setTimeout(() => {
        const timeSinceLastProgress = Date.now() - lastProgressTime;
        if (timeSinceLastProgress > 60000) { // 1 minute without progress
            logWarn('Download appears to be stuck', { 
                downloadId, 
                timeSinceLastProgress, 
                lastProgressPercent 
            });
        }
    }, 30000); // Check every 30 seconds

    // Add process health monitoring
    processHealthInterval = setInterval(() => {
        if (downloadProcess && downloadProcess.ytDlpProcess) {
            const isRunning = !downloadProcess.ytDlpProcess.killed && 
                             downloadProcess.ytDlpProcess.exitCode === null;
            
            if (!isRunning) {
                logWarn('yt-dlp process is not running', { 
                    downloadId, 
                    killed: downloadProcess.ytDlpProcess.killed,
                    exitCode: downloadProcess.ytDlpProcess.exitCode
                });
            } else {
                // Log process health every 10 seconds for debugging
                logInfo('yt-dlp process health check', { 
                    downloadId, 
                    pid: downloadProcess.ytDlpProcess.pid,
                    isRunning: true
                });
            }
        }
    }, 10000); // Check every 10 seconds

    // Send initial progress
    res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        percent: 0,
        message: 'กำลังเริ่มดาวโหลด...'
    })}

`);
    
    // Use the 'progress' event for accurate progress reporting
    downloadProcess.on('progress', (progress) => {
        lastProgressTime = Date.now();
        lastProgressPercent = progress.percent;
        
        const rawPercent = progress.percent;
        let finalPercent = 0;
        let message;

        if (downloadStage === 'video') {
            // Scale video progress to be 0-80% of the total
            finalPercent = Math.round(rawPercent * 0.8);
            message = `[1/3] กำลังดาวน์โหลดวิดีโอ...`;
        } else if (downloadStage === 'audio') {
            // Scale audio progress to be 80-100% of the total
            finalPercent = 80 + Math.round(rawPercent * 0.2);
            message = `[2/3] กำลังดาวน์โหลดเสียง...`;
        } else if (downloadStage === 'merge') {
            finalPercent = 100;
            message = `[3/3] กำลังรวมไฟล์...`;
        } else {
            finalPercent = rawPercent;
            message = `กำลังดาวน์โหลด...`;
        }

        logInfo('Download progress', { downloadId, percent: finalPercent, message: message, frontendId: frontendDownloadId });
        
        // Send progress to frontend
        const progressData = {
            type: 'progress',
            percent: finalPercent,
            message: message
        };
        
        try {
            res.write(`data: ${JSON.stringify(progressData)}

`);
            logInfo('Progress sent to frontend', { downloadId, percent: finalPercent });
        } catch (error) {
            logError('Failed to send progress to frontend', { downloadId, error: error.message });
        }
    });

    // Handle process events
    downloadProcess.on('error', (error) => {
        logError('Download process error', { downloadId, error: error.message, stack: error.stack });
        cleanup();
        res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            message: `เกิดข้อผิดพลาดในการดาวโหลด: ${error.message}` 
        })}

`);
        res.end();
        activeDownloads.delete(downloadId);
        
        // Add session separator
        logInfo('=== Download Session Ended (Process Error) ===', { downloadId, frontendId: frontendDownloadId });
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

    // Handle stdout output for debugging
    if (downloadProcess.ytDlpProcess && downloadProcess.ytDlpProcess.stdout) {
        let destinationCount = 0;
        downloadProcess.ytDlpProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('[download] Destination:')) {
                destinationCount++;
                if (destinationCount === 2) {
                    downloadStage = 'audio';
                }
            }
            if (output.includes('[Merger]')) {
                downloadStage = 'merge';
            }
            if (output.trim()) {
                logInfo('yt-dlp stdout output', { downloadId, stdout: output.trim() });
            }
        });
    }

    downloadProcess.on('close', (code) => {
        logInfo('Download process exited', { downloadId, exitCode: code, frontendId: frontendDownloadId });
        cleanup();
        
        // Handle different exit codes
        if (code === 0) {
            // Successful completion
            logInfo('Download completed successfully', { downloadId, exitCode: code });
        } else if (code === null) {
            // Process terminated (possibly by system or user)
            logWarn('Download process terminated unexpectedly', { downloadId, exitCode: code, frontendId: frontendDownloadId });
            
            // For frontend requests, try to find any recently created files
            if (frontendDownloadId) {
                logInfo('Attempting to recover from unexpected termination for frontend request', { downloadId, frontendId: frontendDownloadId });
            }
        } else {
            // Error exit code
            logError('Download failed with exit code', { downloadId, exitCode: code, frontendId: frontendDownloadId });
        }
        
        if (code === 0) {
            // Download successful (0)
            try {
                // Find the downloaded file with improved detection
                const expectedFileNameStart = sanitizedTitle;
                const files = fs.readdirSync(videosDir);
                
                // Log all files for debugging
                logInfo('Files in videos directory', { downloadId, files: files.slice(0, 10) }); // Log first 10 files
                
                // Get download start time for filtering recent files
                const downloadStartTime = activeDownloads.has(downloadId) ? activeDownloads.get(downloadId).startTime : Date.now() - 60000;
                
                // Try multiple patterns to find the video file
                let videoFile = files.find(file => 
                    file.startsWith(expectedFileNameStart) && (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
                );
                
                // If not found, try to find any recent video file created after download started
                if (!videoFile) {
                    const recentFiles = files.filter(file => {
                        if (!(file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv')) || file.includes('thumbnail')) {
                            return false;
                        }
                        
                        try {
                            const filePath = path.join(videosDir, file);
                            const stats = fs.statSync(filePath);
                            return stats.mtime.getTime() > downloadStartTime;
                        } catch (error) {
                            return false;
                        }
                    });
                    
                    if (recentFiles.length > 0) {
                        // Get the most recently modified file
                        const stats = recentFiles.map(file => ({
                            name: file,
                            mtime: fs.statSync(path.join(videosDir, file)).mtime
                        }));
                        stats.sort((a, b) => b.mtime - a.mtime);
                        videoFile = stats[0].name;
                        logInfo('Using most recent video file created after download', { 
                            downloadId, 
                            fileName: videoFile, 
                            downloadStartTime: new Date(downloadStartTime).toISOString(),
                            fileCreatedTime: stats[0].mtime.toISOString()
                        });
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
                    })}

`);
                } else {
                    logError('Downloaded file not found', { 
                        downloadId, 
                        expectedFileName: expectedFileNameStart,
                        availableFiles: files.filter(f => f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv'))
                    });
                    res.write(`data: ${JSON.stringify({ 
                        type: 'error', 
                        message: 'ไม่พบไฟล์วิดีโอที่ดาวโหลด' 
                    })}

`);
                }
            } catch (error) {
                logError('Error processing completed download', { downloadId, error: error.message });
                res.write(`data: ${JSON.stringify({ 
                    type: 'error', 
                    message: `เกิดข้อผิดพลาด: ${error.message}` 
                })}

`);
            }
        } else if (code === null) {
            // Process terminated unexpectedly; treat as retryable failure
            logWarn('Download process terminated unexpectedly', { downloadId, exitCode: code, frontendId: frontendDownloadId });
            const errorMessage = frontendDownloadId ?
                'การดาวโหลดถูกยุติกะทันหัน โปรดลองใหม่อีกครั้ง' :
                'การดาวโหลดถูกยุติกะทันหัน';
            res.write(`data: ${JSON.stringify({ 
                type: 'error', 
                message: errorMessage,
                retryable: true
            })}

`);
        } else {
            // Download failed with non-zero exit code
            logError('Download failed with exit code', { downloadId, exitCode: code, frontendId: frontendDownloadId });
            
            // For frontend requests, provide more detailed error information
            const errorMessage = frontendDownloadId ? 
                `การดาวโหลดล้มเหลว (รหัส: ${code}). กรุณาลองใหม่อีกครั้ง` :
                `การดาวโหลดล้มเหลว (exit code: ${code})`;
                
            res.write(`data: ${JSON.stringify({ 
                type: 'error', 
                message: errorMessage,
                exitCode: code,
                retryable: frontendDownloadId ? true : false
            })}

`);
        }
        
        res.end();
        activeDownloads.delete(downloadId);
        
        // Add session separator
        logInfo('=== Download Session Ended ===', { downloadId, frontendId: frontendDownloadId });
    });

    // Handle client disconnect
    req.on('close', () => {
        // Do not kill the download on SSE disconnect; allow it to continue in the background
        // Note: cleanup() is NOT called here to let download continue
        logWarn('SSE client disconnected; keeping download running', { downloadId, url });
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
    const activeIds = Array.from(activeDownloads.keys());
    
    logInfo('Received cancel request', { 
        requestedId: downloadId,
        totalActive: activeDownloads.size,
        activeIds: activeIds,
        hasMatch: activeDownloads.has(downloadId)
    });
    
    if (activeDownloads.has(downloadId)) {
        const download = activeDownloads.get(downloadId);
        logInfo('Cancelling download', { downloadId, url: download.url, hasProcess: !!download.process });
        
        // Set cancelled flag FIRST for early cancellation handling
        download.cancelled = true;
        
        // Clean up timers and intervals
        if (download.cleanup) {
            download.cleanup();
            logInfo('Cleanup timers/intervals', { downloadId });
        }
        
        // Kill the process if it exists
        if (download.process && download.process.ytDlpProcess) {
            try {
                download.process.ytDlpProcess.kill('SIGKILL'); // Use SIGKILL for immediate termination
                logInfo('Process killed with SIGKILL', { downloadId, pid: download.process.ytDlpProcess.pid });
            } catch (error) {
                logError('Failed to kill process', { downloadId, error: error.message });
            }
            // Delete from map after killing process
            activeDownloads.delete(downloadId);
        } else {
            // No process yet - keep in map with cancelled flag so initialization can detect it
            logWarn('No process to kill yet (early cancellation) - keeping in map with cancelled flag', { downloadId });
            // Will be cleaned up when initialization detects the cancelled flag
        }
        
        res.json({ message: 'Download cancelled', downloadId, hadProcess: !!download.process });
    } else {
        logWarn('Download not found for cancellation (may not have started yet or already finished)', { 
            requestedId: downloadId, 
            availableIds: activeIds 
        });
        
        // Add to pending cancellations in case the download hasn't started yet
        pendingCancellations.add(downloadId);
        logInfo('Added to pending cancellations', { downloadId, pendingCount: pendingCancellations.size });
        
        // Return 200 instead of 404 - download may not have started yet
        // This prevents race condition where cancel arrives before download endpoint
        res.json({ 
            message: 'Download cancellation registered (download may not have started yet)',
            requestedId: downloadId,
            addedToPending: true
        });
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

// Get queue endpoint - returns all queue items
app.get('/api/queue', (req, res) => {
    try {
        logInfo('Queue data requested', { itemCount: queueData.length });
        res.json({ 
            success: true, 
            queue: queueData,
            count: queueData.length
        });
    } catch (error) {
        logError('Failed to retrieve queue data', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Failed to retrieve queue data' 
        });
    }
});

// Add item to queue endpoint
app.post('/api/queue', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ 
                success: false, 
                error: 'URL is required' 
            });
        }
        
        // Check if URL already exists in queue
        const existingItem = queueData.find(item => item.url === url);
        if (existingItem) {
            logWarn('URL already exists in queue', { url, existingId: existingItem.id });
            return res.status(409).json({ 
                success: false, 
                error: 'URL already exists in queue',
                existingItem 
            });
        }
        
        // Fetch video metadata
        let videoInfo;
        try {
            videoInfo = await ytDlpWrap.getVideoInfo(url);
            logInfo('Fetched video metadata for queue', { title: videoInfo.title, url });
        } catch (error) {
            logError('Failed to fetch video metadata', { error: error.message, url });
            return res.status(400).json({ 
                success: false, 
                error: 'ไม่สามารถดึงข้อมูลวิดีโอได้ กรุณาตรวจสอบ URL' 
            });
        }
        
        // Create new queue item
        const queueItem = {
            id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: url,
            title: videoInfo.title || 'Unknown Title',
            thumbnail: videoInfo.thumbnail || videoInfo.thumbnails?.[videoInfo.thumbnails.length - 1]?.url || null,
            status: QueueStatus.PENDING,
            progress: 0,
            pid: null,
            filePath: null,
            error: null,
            addedAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null
        };
        
        // Add to queue
        queueData.push(queueItem);
        
        // Save to file
        saveQueueData();
        
        logInfo('Added new item to queue', { id: queueItem.id, title: queueItem.title, url });
        
        res.json({ 
            success: true, 
            message: 'เพิ่มเข้าคิวสำเร็จ',
            item: queueItem
        });
    } catch (error) {
        logError('Failed to add item to queue', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'เกิดข้อผิดพลาดในการเพิ่มเข้าคิว' 
        });
    }
});

// Initialize queue data on server start
loadQueueData();
recoverQueue();

// Start server
app.listen(PORT, () => {
    logInfo('Backend server started', { 
        port: PORT, 
        staticPath: path.join(__dirname, 'src'),
        videosPath: path.join(__dirname, 'src', 'videos'),
        queueDataFile: QUEUE_DATA_FILE,
        serverLogFile: logFile,
        frontendLogFile: path.join(__dirname, 'logs', 'frontend.log')
    });
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📁 Serving static files from: ${path.join(__dirname, 'src')}`);
    console.log(`🎥 Video downloads will be saved to: ${path.join(__dirname, 'src', 'videos')}`);
    console.log(`💾 Queue data will be saved to: ${QUEUE_DATA_FILE}`);
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
