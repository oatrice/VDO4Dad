import { test, expect, ConsoleMessage } from '@playwright/test';

test.describe('Download flow (mocked SSE)', () => {
    test('shows success message with mocked EventSource', async ({ page }) => {
        // Collect all console logs for debugging
        const consoleMessages: string[] = [];
        page.on('console', (msg: ConsoleMessage) => {
            consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
        });

        // Set up mock EventSource
        await page.addInitScript(() => {
            const simulatedFilePath = 'videos/mock-video.mp4';
            class MockEventSource {
                onmessage: ((event: MessageEvent) => void) | null = null;
                onerror: ((event: Event) => void) | null = null;
                private timeoutIds: NodeJS.Timeout[] = [];

                constructor(url: string) {
                    console.log(`MockEventSource created for URL: ${url}`);
                    
                    // Simulate different stages of download
                    this.timeoutIds.push(
                        setTimeout(() => this.emitMessage({ type: 'start', message: 'Starting download...' }), 20),
                        setTimeout(() => this.emitMessage({ type: 'progress', percent: 40 }), 80),
                        setTimeout(() => this.emitMessage({ 
                            type: 'done', 
                            message: 'Download complete!', 
                            filePath: simulatedFilePath, 
                            title: 'Mock Video' 
                        }), 150)
                    );
                }

                private emitMessage(data: any) {
                    if (this.onmessage) {
                        this.onmessage(new MessageEvent('message', { 
                            data: JSON.stringify(data) 
                        }));
                    }
                }

                addEventListener() {}
                
                close() {
                    // Clean up timeouts to prevent memory leaks
                    this.timeoutIds.forEach(clearTimeout);
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


