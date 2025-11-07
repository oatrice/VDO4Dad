import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    testMatch: '**/*.mock.spec.ts',  // Only run mock tests
    timeout: 120000,  // 2 minutes per test (reduced from 10 minutes)
    expect: { timeout: 30000 },  // 30 seconds for assertions (reduced from 3 minutes)
    retries: 1,  // Reduced from 2
    workers: 4,  // Increased from 1 to run tests in parallel
    reporter: [
        ['list'],
        ['html', { open: 'never' }],
        ['github'],
        ['junit', { outputFile: './test-results/junit/junit-report.xml' }]
    ],
    use: {
        baseURL: 'http://localhost:8080',
        headless: true,
        trace: 'on',  // Record traces for all tests
        screenshot: 'only-on-failure',
        video: 'off',  // Disable video recording to speed up tests
        viewport: { width: 1280, height: 800 }
    },
    webServer: [
        {
            command: 'npm run backend',
            url: 'http://localhost:3000/health',
            reuseExistingServer: false,  // Ensure fresh server for each test run
            timeout: 60000  // 1 minute to start the server
        },
        {
            command: 'npm run serve',
            url: 'http://localhost:8080',
            reuseExistingServer: false,  // Ensure fresh server for each test run
            timeout: 30000  // 30 seconds to start the server
        }
    ]
});
