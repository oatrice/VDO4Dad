import { test, expect } from '@playwright/test';

test.describe('Download flow', () => {
    test('downloads a video and shows success message', async ({ page, request }) => {
        // Verify backend health first (helps with clearer error if backend not up)
        const health = await request.get('http://localhost:3000/health');
        expect(health.ok()).toBeTruthy();

        await page.goto('/');

        // Input a known short public test video URL
        const testUrl = 'https://www.youtube.com/watch?v=COcc7SZsRyQ';
        await page.fill('#url-input', testUrl);

        // Click the download button
        await page.click('#download-btn');

        // First, the status item should appear quickly (progress bar may be zero-width initially)
        const statusItem = page.locator('#download-status-container .download-status-item');
        await statusItem.waitFor({ state: 'visible', timeout: 60000 });

        // Then wait longer for either success or error
        const successLocator = page.locator('#download-status-container .download-status-item.success');
        const errorLocator = page.locator('#download-status-container .download-status-item.error');

        const result = await Promise.race([
            successLocator.waitFor({ state: 'visible', timeout: 480000 }).then(() => 'success'), // up to 8 minutes
            errorLocator.waitFor({ state: 'visible', timeout: 480000 }).then(() => 'error')
        ]);

        expect(result).toBe('success');

        // Verify videos.json has the new item by reloading and checking list updated
        await page.reload();
        const videoListItems = page.locator('#video-list .video-list-item');
        await expect(videoListItems.first()).toBeVisible();
    });
});


