import { test, expect, ConsoleMessage } from '@playwright/test';

test.describe('Download flow (real)', () => {
    test('downloads a real video and shows success', async ({ page, request }) => {
        // Collect all console logs for debugging
        const consoleMessages: string[] = [];
        page.on('console', (msg: ConsoleMessage) => {
            consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
        });

        try {
            // Set test timeout to 10 minutes (for real download)
            test.setTimeout(600000);

            // Health check backend first
            const health = await request.get('http://localhost:3000/health');
            expect(health.ok()).toBeTruthy();

            // Navigate with timeout
            await page.goto('/', { 
                waitUntil: 'domcontentloaded', 
                timeout: 30000 
            });

            // Short reliable public video (adjustable)
            const testUrl = 'https://www.youtube.com/watch?v=COcc7SZsRyQ';
            
            // Fill the form with correct selectors
            await page.fill('#queue-url-input', testUrl, { timeout: 10000 });
            await page.click('#add-to-queue-btn', { timeout: 10000 });

            // Wait for status item with error handling
            const statusItem = page.locator('#download-status-container .download-status-item');
            try {
                await statusItem.waitFor({ state: 'visible', timeout: 60000 });
                console.log('Status item appeared successfully');
            } catch (error) {
                throw new Error('Status item did not appear within 60 seconds. ' +
                              'Check if the download started properly.');
            }

            // Set up success and error locators
            const successLocator = page.locator('#download-status-container .download-status-item.success');
            const errorLocator = page.locator('#download-status-container .download-status-item.error');
            
            console.log('Waiting for download to complete... (this may take a few minutes)');
            
            // Helper function to wait for an element with better error handling
            const waitForStatus = async (locator: any, type: string, timeout: number) => {
                try {
                    await locator.waitFor({ state: 'visible', timeout });
                    console.log(`${type} state detected`);
                    return type;
                } catch (error) {
                    console.log(`Timeout waiting for ${type}:`, error.message);
                    return `timeout-${type}`;
                }
            };
            
            // Wait for either success or error state
            const result = await Promise.race([
                waitForStatus(successLocator, 'success', 480000),
                waitForStatus(errorLocator, 'error', 480000)
            ]);

            // Log the result
            console.log(`Test completed with result: ${result}`);
            
            // Take a screenshot for debugging
            await page.screenshot({ path: 'download-test-result.png', fullPage: true });
            console.log('Screenshot saved as download-test-result.png');

            // Verify the result
            expect(result).toBe('success');
            
        } catch (error) {
            // Log all console messages when test fails
            console.error('Test failed. Console logs:');
            console.log(consoleMessages.join('\n'));
            
            // Take a screenshot on failure
            await page.screenshot({ path: 'download-test-failure.png', fullPage: true });
            console.log('Screenshot saved as download-test-failure.png');
            
            // Re-throw the error to fail the test
            throw error;
        }
    });
});


