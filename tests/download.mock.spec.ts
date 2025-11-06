import { test, expect, ConsoleMessage } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Download flow (mocked SSE)', () => {
    test('shows success message with mocked EventSource', async ({ page }) => {
        // Create test log file path
        const testLogDir = path.join(__dirname, '..', 'logs');
        const testLogFile = path.join(testLogDir, 'test-frontend.log');
        
        // Ensure logs directory exists
        if (!fs.existsSync(testLogDir)) {
            fs.mkdirSync(testLogDir, { recursive: true });
        }
        
        // Helper function to write log with current timestamp
        const writeTestLog = (message: string) => {
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] [TEST] ${message}\n`;
            fs.appendFileSync(testLogFile, logEntry, 'utf8');
        };
        
        // Collect all console logs for debugging
        const consoleMessages: string[] = [];
        page.on('console', (msg: ConsoleMessage) => {
            const logMsg = `[${msg.type()}] ${msg.text()}`;
            consoleMessages.push(logMsg);
            writeTestLog(logMsg);
        });

        // Collect network requests for debugging
        const networkRequests: string[] = [];
        page.on('request', (request) => {
            const url = request.url();
            if (url.includes('/api/')) {
                const logMsg = `[REQUEST] ${request.method()} ${url}`;
                networkRequests.push(logMsg);
                writeTestLog(logMsg);
            }
        });
        page.on('response', (response) => {
            const url = response.url();
            if (url.includes('/api/')) {
                const logMsg = `[RESPONSE] ${response.status()} ${response.statusText()} ${url}`;
                networkRequests.push(logMsg);
                writeTestLog(logMsg);
            }
        });
        page.on('requestfailed', (request) => {
            const url = request.url();
            if (url.includes('/api/')) {
                const logMsg = `[REQUEST FAILED] ${request.method()} ${url} - ${request.failure()?.errorText}`;
                networkRequests.push(logMsg);
                writeTestLog(logMsg);
            }
        });
        
        writeTestLog('Test started');

        // Mock the /api/queue/getInfo endpoint
        await page.route('**/api/queue/getInfo', async (route) => {
            const request = route.request();
            const postData = request.postDataJSON();
            console.log('[MOCK] Intercepted /api/queue/getInfo request:', postData);
            
            // Mock response with queue item data
            const mockQueueItem = {
                id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                url: postData.urls[0],
                title: 'Mock Video Title',
                thumbnail: 'https://via.placeholder.com/120x90',
                status: 'PENDING',
                progress: 0,
                pid: null,
                filePath: null,
                error: null,
                addedAt: new Date().toISOString(),
                startedAt: null,
                completedAt: null
            };

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    summary: {
                        total: 1,
                        success: 1,
                        failed: 0
                    },
                    results: [{
                        url: postData.urls[0],
                        success: true,
                        item: mockQueueItem
                    }]
                })
            });
        });

        // Set up mock EventSource with detailed logging
        await page.addInitScript(() => {
            const simulatedFilePath = 'videos/mock-video.mp4';
            
            // Add debug logging function
            const debugLog = (message: string, data?: any) => {
                console.log(`[MockEventSource] ${message}`, data || '');
            };
            
            class MockEventSource {
                onmessage: ((event: MessageEvent) => void) | null = null;
                onerror: ((event: Event) => void) | null = null;
                private timeoutIds: NodeJS.Timeout[] = [];
                private url: string;

                constructor(url: string) {
                    this.url = url;
                    debugLog(`Created for URL: ${url}`);
                    
                    // Simulate different stages of download
                    this.scheduleEvent('start', { type: 'start', message: 'Starting download...' }, 20);
                    this.scheduleEvent('progress', { type: 'progress', percent: 40 }, 80);
                    this.scheduleEvent('done', { 
                        type: 'done', 
                        message: 'Download complete!', 
                        filePath: simulatedFilePath, 
                        title: 'Mock Video' 
                    }, 150);
                }
                
                private scheduleEvent(name: string, data: any, delay: number) {
                    debugLog(`Scheduling ${name} event in ${delay}ms`, data);
                    this.timeoutIds.push(
                        setTimeout(() => this.emitMessage(data), delay)
                    );
                }
                
                private emitMessage(data: any) {
                    debugLog(`Emitting message: ${data.type}`, data);
                    if (this.onmessage) {
                        const event = new MessageEvent('message', { 
                            data: JSON.stringify(data) 
                        });
                        debugLog(`Dispatching message to onmessage handler`, data);
                        this.onmessage(event);
                    } else {
                        debugLog('No onmessage handler registered!', null);
                    }
                }

                addEventListener(event: string, listener: EventListenerOrEventListenerObject | null) {
                    debugLog(`addEventListener called for '${event}'`);
                    if (event === 'message' && typeof listener === 'function') {
                        this.onmessage = (e) => (listener as (e: MessageEvent) => void)(e);
                    } else if (event === 'error' && typeof listener === 'function') {
                        this.onerror = (e) => (listener as (e: Event) => void)(e);
                    }
                }
                
                close() {
                    debugLog('Closing MockEventSource');
                    // Clean up timeouts to prevent memory leaks
                    this.timeoutIds.forEach(clearTimeout);
                    this.timeoutIds = [];
                }
            }
            // @ts-ignore
            window.EventSource = MockEventSource;
        });

        try {
            // Set test timeout to 30 seconds (overrides the config timeout for this test)
            test.setTimeout(30000);

            // Add navigation timeout
            await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10000 });
            
            // Add action timeouts with correct selectors
            await page.fill('#queue-url-input', 'https://example.com/video', { timeout: 5000 });
            await page.click('#add-to-queue-btn', { timeout: 5000 });

            // Wait for queue item to appear
            console.log('Waiting for queue item to appear...');
            const queueItem = page.locator('#queue-list .queue-item');
            try {
                await queueItem.waitFor({ state: 'visible', timeout: 10000 });
                console.log('Queue item is visible');
                
                // Debug: Log the HTML of the queue list
                const queueListHtml = await page.locator('#queue-list').innerHTML();
                console.log('Queue list content:', queueListHtml);
                
            } catch (error) {
                // Log the current page state before failing
                console.error('Status item not found. Current page state:');
                console.log('Page URL:', page.url());
                console.log('Page title:', await page.title());
                
                // Check if the container exists
                const containerExists = await page.locator('#download-status-container').isVisible();
                console.log('Container exists:', containerExists);
                
                if (containerExists) {
                    const containerHtml = await page.locator('#download-status-container').innerHTML();
                    console.log('Container HTML:', containerHtml);
                } else {
                    console.log('Container HTML (entire page):', await page.content());
                }
                
                throw new Error('Status item did not appear within 10 seconds. See logs for details.');
            }

            // Wait for download to complete (badge shows "สำเร็จ")
            const successIndicator = page.locator('#queue-list .queue-item .status-badge.status-completed');
            try {
                await successIndicator.waitFor({ state: 'visible', timeout: 10000 });
                console.log('Download completed successfully');
            } catch (error) {
                // If we can't find the success indicator, check the current state of the queue item
                const currentState = await page.locator('#queue-list .queue-item').textContent();
                throw new Error(`Download did not complete successfully. Current state: ${currentState}`);
            }

            // Verify the success message content
            await expect(successIndicator).toContainText('สำเร็จ', { timeout: 5000 });
            
            writeTestLog('Test passed successfully');
            
        } catch (error) {
            // Log test failure
            writeTestLog(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
            
            // Log all console messages when test fails
            console.error('Test failed. Console logs:');
            console.log(consoleMessages.join('\n'));
            writeTestLog('Console logs:\n' + consoleMessages.join('\n'));
            
            // Log network requests when test fails
            console.error('Network requests:');
            console.log(networkRequests.join('\n'));
            writeTestLog('Network requests:\n' + networkRequests.join('\n'));
            
            // Take a screenshot on failure
            await page.screenshot({ path: 'test-failure.png', fullPage: true });
            console.log('Screenshot saved as test-failure.png');
            writeTestLog('Screenshot saved as test-failure.png');
            
            // Re-throw the error to fail the test
            throw error;
        }
    });
});


