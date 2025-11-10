const { YtDlp } = require('ytdlp-nodejs');
const ytdlp = new YtDlp();
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
ffmpeg.setFfprobePath(ffprobePath);

// Test ytdlp functionality
async function testYtDlp() {
    console.log('🧪 Testing ytdlp functionality...');
    
    try {
        // Check if yt-dlp is installed
        const isInstalled = await ytdlp.checkInstallationAsync();
        if (!isInstalled) {
            throw new Error('yt-dlp is not installed or not in PATH');
        }
        
        // Get version by executing yt-dlp --version
        const version = await ytdlp.execAsync('--version');
        console.log('✅ ytdlp version:', version.trim());
        
        // Get help by executing yt-dlp --help
        const help = await ytdlp.execAsync('--help');
        console.log('✅ ytdlp help available (length:', help.length, 'characters)');
        
        console.log('🎉 ytdlp is working correctly!');
        return true;
    } catch (error) {
        console.error('❌ ytdlp test failed:', error.message);
        return false;
    }
}

// Test server functionality
async function testServer() {
    console.log('🧪 Testing server functionality...');
    
    try {
        const response = await fetch('http://localhost:3000/health');
        const data = await response.json();
        
        if (data.status === 'OK') {
            console.log('✅ Server is running and responding');
            return true;
        } else {
            console.error('❌ Server returned unexpected status:', data);
            return false;
        }
    } catch (error) {
        console.error('❌ Server test failed:', error.message);
        console.log('💡 Make sure to run: npm run backend');
        return false;
    }
}

// Verify that the downloaded video file is playable
async function verifyVideoFile(relativePath) {
    console.log(`\n🕵️  Verifying downloaded file: ${relativePath}`);
    const decodedPath = decodeURIComponent(relativePath);
    const absolutePath = path.join(__dirname, 'src', decodedPath);

    if (!fs.existsSync(absolutePath)) {
        console.error(`❌ Verification failed: File not found at ${absolutePath}`);
        return false;
    }

    return new Promise((resolve) => {
        ffmpeg.ffprobe(absolutePath, (err, metadata) => {
            if (err) {
                console.error(`❌ Verification failed: ffprobe error:`, err.message);
                resolve(false);
                return;
            }

            if (metadata && metadata.streams && metadata.streams.some(s => s.codec_type === 'video') && metadata.format.duration > 0) {
                console.log(`✅ Verification successful: Video has a valid video stream and duration (${metadata.format.duration}s).`);
                resolve(true);
            } else {
                console.error('❌ Verification failed: File is not a valid video file (no video stream or zero duration).');
                resolve(false);
            }
        });
    });
}

// Test download endpoint functionality
async function testDownloadEndpoint() {
    console.log('🧪 Testing /download endpoint...');

    // A short, reliable, public domain video for testing
    const testUrl = 'https://www.youtube.com/watch?v=COcc7SZsRyQ';
    
    return new Promise((resolve, reject) => {
        // Use native fetch for SSE in Node.js 18+
        const controller = new AbortController();
        const abortSignal = controller.signal;
        fetch(`http://localhost:3000/download?url=${encodeURIComponent(testUrl)}`, { signal: abortSignal }).then(async (response) => {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let testPassed = false;

            const testTimeout = setTimeout(() => {
                if (!testPassed) {
                    console.error('❌ Download test timed out after 120 seconds.');
                    try { controller.abort(); } catch (_) { /* ignore */ }
                    reject(new Error('Download test timed out'));
                }
            }, 120000); // 120-second timeout

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.startsWith('data:'));

                for (const line of lines) {
                    const json = line.substring(5);
                    const data = JSON.parse(json);
                    if (data.type === 'done' && data.filePath) {
                        console.log(`✅ Download test successful: '${data.title}' downloaded.`);
                        // Now, verify the file is playable
                        const isPlayable = await verifyVideoFile(data.filePath);
                        testPassed = true;
                        clearTimeout(testTimeout);
                        resolve(isPlayable);
                        return;
                    }
                }
            }
            // If loop finishes without 'done' event
            if (!testPassed) reject(new Error('Stream ended before download was complete.'));
        }).catch(error => {
            console.error('❌ Download test failed:', error.message);
            reject(error);
        });
    });
}

// Main test function
async function runTests() {
    console.log('🚀 Starting VDO4Dad system tests...\n');
    
    const ytDlpOk = await testYtDlp();
    console.log('');
    
    const serverOk = await testServer();
    console.log('');

    let downloadOk = false;
    if (serverOk) {
        try {
            downloadOk = await testDownloadEndpoint();
        } catch (e) { /* Error is already logged inside the function */ }
    }
    console.log('');
    
    if (ytDlpOk && serverOk && downloadOk) {
        console.log('🎉 All tests passed! Your system is ready to use.');
        console.log('📝 To start the full application:');
        console.log('   npm run dev-full');
        console.log('📝 Or run separately:');
        console.log('   npm run backend  (Terminal 1)');
        console.log('   npm run dev      (Terminal 2)');
    } else {
        console.log('❌ Some tests failed. Please check the errors above.');
        if (!ytDlpOk) {
            console.log('💡 Install yt-dlp: brew install yt-dlp');
        }
        if (!serverOk) {
            console.log('💡 Start server: npm run backend');
        }
        if (serverOk && !downloadOk) {
            console.log('💡 Check the server logs for errors related to the /download endpoint.');
        }
    }
}

// Run tests
runTests().catch(console.error);