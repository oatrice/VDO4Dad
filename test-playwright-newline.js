const { chromium } = require('playwright');

async function testDownload() {
    const browser = await chromium.launch({ 
        headless: false, // Show browser for debugging
        slowMo: 500 // Slow down actions for better observation
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Enable console logging
    page.on('console', msg => {
        console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
    });
    
    // Enable network logging
    page.on('response', response => {
        if (response.url().includes('/download')) {
            console.log(`[Network] Response from ${response.url()}: ${response.status()}`);
        }
    });
    
    try {
        console.log('🚀 Opening browser and navigating to localhost:3000...');
        await page.goto('http://localhost:3000');
        
        // Wait for page to load
        await page.waitForLoadState('networkidle');
        
        console.log('📝 Filling in YouTube URL...');
        const urlInput = page.locator('#url-input');
        await urlInput.fill('https://www.youtube.com/watch?v=COcc7SZsRyQ');
        
        console.log('🎬 Clicking download button...');
        const downloadButton = page.locator('#download-btn');
        await downloadButton.click();
        
        // Wait for download status to appear
        console.log('⏳ Waiting for download status...');
        await page.waitForSelector('.download-status-item', { timeout: 10000 });
        
        // Monitor download progress
        console.log('📊 Monitoring download progress...');
        let progressComplete = false;
        let lastProgress = 0;
        
        // Set up progress monitoring
        const progressInterval = setInterval(async () => {
            try {
                const statusItems = await page.locator('.download-status-item').all();
                for (const item of statusItems) {
                    const text = await item.textContent();
                    const progressMatch = text.match(/(\d+)%/);
                    if (progressMatch) {
                        const currentProgress = parseInt(progressMatch[1]);
                        if (currentProgress > lastProgress) {
                            console.log(`📈 Progress: ${currentProgress}%`);
                            lastProgress = currentProgress;
                        }
                        if (currentProgress >= 100) {
                            progressComplete = true;
                            clearInterval(progressInterval);
                        }
                    }
                    // Check for completion message
                    if (text.includes('ดาวโหลดสำเร็จ') || text.includes('สำเร็จ')) {
                        console.log('✅ Download completed!');
                        progressComplete = true;
                        clearInterval(progressInterval);
                    }
                }
            } catch (error) {
                console.log('⚠️ Error monitoring progress:', error.message);
            }
        }, 1000);
        
        // Wait for completion or timeout
        const startTime = Date.now();
        const timeout = 60000; // 1 minute timeout
        
        while (!progressComplete && (Date.now() - startTime) < timeout) {
            await page.waitForTimeout(1000);
        }
        
        clearInterval(progressInterval);
        
        if (progressComplete) {
            console.log('✅ Download completed successfully!');
        } else {
            console.log('⏰ Download timed out');
        }
        
        // Take screenshot
        await page.screenshot({ path: 'playwright-test-newline.png' });
        console.log('📸 Screenshot saved as playwright-test-newline.png');
        
        // Wait a bit more to see final state
        await page.waitForTimeout(3000);
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        await page.screenshot({ path: 'playwright-test-newline-error.png' });
    } finally {
        await browser.close();
    }
}

testDownload().catch(console.error);
