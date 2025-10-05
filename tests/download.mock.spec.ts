import { test, expect } from '@playwright/test';

test.describe('Download flow (mocked SSE)', () => {
    test('shows success message with mocked EventSource', async ({ page }) => {
        await page.addInitScript(() => {
            const simulatedFilePath = 'videos/%F0%9F%92%971-Minute%20Timer%20%EF%BD%9C%20Pink%20Checkered%20Countdown%20%26%20Soft%20Bell%20%F0%9F%8C%9F%204K.mp4';
            class MockEventSource {
                onmessage: ((event: MessageEvent) => void) | null = null;
                onerror: ((event: Event) => void) | null = null;
                constructor(url: string) {
                    setTimeout(() => { this.onmessage && this.onmessage(new MessageEvent('message', { data: JSON.stringify({ type: 'start', message: 'เริ่มดาวโหลด...' }) })); }, 20);
                    setTimeout(() => { this.onmessage && this.onmessage(new MessageEvent('message', { data: JSON.stringify({ type: 'progress', percent: 40 }) })); }, 80);
                    setTimeout(() => { this.onmessage && this.onmessage(new MessageEvent('message', { data: JSON.stringify({ type: 'done', message: 'ดาวโหลดสำเร็จ!', filePath: simulatedFilePath, title: 'Mock Video' }) })); }, 150);
                }
                addEventListener() {}
                close() {}
            }
            // @ts-ignore
            window.EventSource = MockEventSource;
        });

        await page.goto('/');
        await page.fill('#url-input', 'https://example.com/video');
        await page.click('#download-btn');

        const statusItem = page.locator('#download-status-container .download-status-item');
        await statusItem.waitFor({ state: 'visible', timeout: 10000 });

        const successLocator = page.locator('#download-status-container .download-status-item.success');
        await successLocator.waitFor({ state: 'visible', timeout: 10000 });
    });
});


