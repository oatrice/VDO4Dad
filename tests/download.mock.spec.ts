import { test, expect, ConsoleMessage } from '@playwright/test';

test.describe('Download flow (mocked SSE)', () => {
    test('shows success message with mocked EventSource', async ({ page }) => {
        // Collect all console logs for debugging
        const consoleMessages: string[] = [];
        page.on('console', (msg: ConsoleMessage) => {
            consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
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

            // Wait for download to complete (check for success class or specific text)
            const successIndicator = page.locator('#queue-list .queue-item.completed, #queue-list .queue-item:has-text("ดาวน์โหลดสำเร็จ")');
            try {
                await successIndicator.waitFor({ state: 'visible', timeout: 10000 });
                console.log('Download completed successfully');
            } catch (error) {
                // If we can't find the success indicator, check the current state of the queue item
                const currentState = await page.locator('#queue-list .queue-item').textContent();
                throw new Error(`Download did not complete successfully. Current state: ${currentState}`);
            }

            // Verify the success message content
            await expect(successIndicator).toContainText('ดาวน์โหลดสำเร็จ', { timeout: 5000 });
            
        } catch (error) {
            // Log all console messages when test fails
            console.error('Test failed. Console logs:');
            console.log(consoleMessages.join('\n'));
            
            // Take a screenshot on failure
            await page.screenshot({ path: 'test-failure.png', fullPage: true });
            console.log('Screenshot saved as test-failure.png');
            
            // Re-throw the error to fail the test
            throw error;
        }
    });
});


