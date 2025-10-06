import { test, expect } from '@playwright/test';

test.describe('Download flow (real)', () => {
    test('downloads a real video and shows success', async ({ page, request }) => {
        // Health check backend first
        const health = await request.get('http://localhost:3000/health');
        expect(health.ok()).toBeTruthy();

        await page.goto('/');

        // Short reliable public video (adjustable)
        const testUrl = 'https://www.youtube.com/watch?v=COcc7SZsRyQ';
        await page.fill('#url-input', testUrl);
        await page.click('#download-btn');

        // Wait for status item to appear
        const statusItem = page.locator('#download-status-container .download-status-item');
        await statusItem.waitFor({ state: 'visible', timeout: 60000 });

        // Wait for success or error, with long timeout due to network variability
        const successLocator = page.locator('#download-status-container .download-status-item.success');
        const errorLocator = page.locator('#download-status-container .download-status-item.error');
        const result = await Promise.race([
            successLocator.waitFor({ state: 'visible', timeout: 480000 }).then(() => 'success'),
            errorLocator.waitFor({ state: 'visible', timeout: 480000 }).then(() => 'error')
        ]);

        expect(result).toBe('success');
    });
});


