import { test, expect, ConsoleMessage } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Queue flow (real APIs)', () => {
    test('adds to queue and completes download (real backend)', async ({ page, context, request }) => {
        // Prepare artifact dirs
        const testResultsDir = path.join(__dirname, '..', 'test-results');
        if (!fs.existsSync(testResultsDir)) fs.mkdirSync(testResultsDir, { recursive: true });

        // Start tracing
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

        // Console logs
        const consoleMessages: string[] = [];
        page.on('console', (msg: ConsoleMessage) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));

        // Network capture (for quick debug)
        const networkEvents: string[] = [];
        page.on('request', r => { if (r.url().includes('/api/')) networkEvents.push(`[REQ] ${r.method()} ${r.url()}`); });
        page.on('response', resp => { if (resp.url().includes('/api/')) networkEvents.push(`[RES] ${resp.status()} ${resp.url()}`); });

        try {
            // Increase time (real download may take minutes)
            test.setTimeout(600000); // 10 minutes

            // Health check backend
            const health = await request.get('http://localhost:3000/health');
            expect(health.ok()).toBeTruthy();

            await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Use a short or cached-friendly URL; adjust as needed
            const testUrl = 'https://www.youtube.com/watch?v=COcc7SZsRyQ';

            await page.fill('#queue-url-input', testUrl, { timeout: 10000 });
            await page.click('#add-to-queue-btn', { timeout: 10000 });

            // Queue item should appear
            const queueItem = page.locator('#queue-list .queue-item');
            await queueItem.waitFor({ state: 'visible', timeout: 60000 });

            // Wait for completed badge (UI shows "สำเร็จ")
            const successBadge = page.locator('#queue-list .queue-item .status-badge.status-completed');
            await successBadge.waitFor({ state: 'visible', timeout: 600000 }); // up to 10 minutes

            await expect(successBadge).toContainText('สำเร็จ', { timeout: 10000 });

            await page.screenshot({ path: path.join(testResultsDir, 'queue-real-success.png'), fullPage: true });
        } catch (err) {
            // Dump logs to help debugging
            fs.writeFileSync(path.join(testResultsDir, 'queue-real-console.log'), consoleMessages.join('\n'));
            fs.writeFileSync(path.join(testResultsDir, 'queue-real-network.log'), networkEvents.join('\n'));
            await page.screenshot({ path: path.join(testResultsDir, 'queue-real-failure.png'), fullPage: true });
            throw err;
        } finally {
            await context.tracing.stop({ path: path.join(testResultsDir, 'queue-real-trace.zip') });
        }
    });
});


