import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 600000, // 10 minutes per test to allow video download
    expect: { timeout: 180000 },
    retries: 2,
    workers: 1,
    use: {
        baseURL: 'http://localhost:8080',
        headless: true,
        trace: 'retain-on-failure',
        viewport: { width: 1280, height: 800 }
    },
    webServer: [
        {
            command: 'npm run backend',
            url: 'http://localhost:3000/health',
            reuseExistingServer: true,
            timeout: 120000
        },
        {
            command: 'npm run serve',
            url: 'http://localhost:8080',
            reuseExistingServer: true,
            timeout: 60000
        }
    ],
});


