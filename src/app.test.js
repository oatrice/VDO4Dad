/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Mock EventSource
const mockEventSource = {
    onmessage: jest.fn(),
    onerror: jest.fn(),
    close: jest.fn(),
};
global.EventSource = jest.fn(() => mockEventSource);

describe('VDO4Dad Frontend Tests', () => {
    beforeEach(() => {
        // โหลด HTML และ JS ใหม่ทุกครั้งก่อนการทดสอบแต่ละครั้ง
        const html = fs.readFileSync(path.resolve(__dirname, './index.html'), 'utf8');
        document.body.innerHTML = html;
        
        // Mock location.reload
        Object.defineProperty(window, 'location', {
            writable: true,
            value: { reload: jest.fn() },
        });

        // รันสคริปต์ app.js
        require('./app.js');

        // Reset mocks
        jest.clearAllMocks();
    });

    test('should start download when download button is clicked with a valid URL', () => {
        const urlInput = document.getElementById('url-input');
        const downloadBtn = document.getElementById('download-btn');
        const testUrl = 'https://www.youtube.com/watch?v=LXb3EKWsInQ';

        // 1. ใส่ URL ใน input
        urlInput.value = testUrl;

        // 2. คลิกปุ่มดาวน์โหลด
        downloadBtn.click();

        // 3. ตรวจสอบว่าปุ่มถูกปิดใช้งานและข้อความเปลี่ยนไป
        expect(downloadBtn.disabled).toBe(true);
        expect(downloadBtn.textContent).toContain('กำลังดาวน์โหลด...');

        // 4. ตรวจสอบว่า EventSource ถูกเรียกด้วย URL ที่ถูกต้อง
        expect(global.EventSource).toHaveBeenCalledWith(`http://localhost:3000/download?url=${encodeURIComponent(testUrl)}`);

        // 5. ตรวจสอบว่ามีการสร้าง status element
        const statusContainer = document.getElementById('download-status-container');
        expect(statusContainer.children.length).toBe(1);
        expect(statusContainer.innerHTML).toContain('กำลังดาวน์โหลด:');
    });

    test('should update UI correctly on "progress" and "done" events', async () => {
        const urlInput = document.getElementById('url-input');
        const downloadBtn = document.getElementById('download-btn');
        const testUrl = 'https://www.youtube.com/watch?v=LXb3EKWsInQ';

        urlInput.value = testUrl;
        downloadBtn.click();

        // --- จำลอง Event: progress ---
        const progressEvent = { data: JSON.stringify({ type: 'progress', percent: 50 }) };
        mockEventSource.onmessage(progressEvent);

        const progressBar = document.querySelector('.progress-bar');
        expect(progressBar.style.width).toBe('50%');
        expect(progressBar.textContent).toBe('50%');

        // --- จำลอง Event: done ---
        const doneEvent = { data: JSON.stringify({ type: 'done', title: 'Test Video', message: 'สำเร็จ!' }) };
        mockEventSource.onmessage(doneEvent);

        const statusItem = document.querySelector('.download-status-item');
        expect(statusItem.classList.contains('success')).toBe(true);
        expect(statusItem.innerHTML).toContain('✅ ดาวน์โหลด \'Test Video\' สำเร็จ!');

        // ตรวจสอบว่า EventSource ถูกปิด
        expect(mockEventSource.close).toHaveBeenCalled();

        // รอให้ setTimeout ทำงานก่อนที่จะตรวจสอบ location.reload
        await new Promise(resolve => setTimeout(resolve, 1600));
        expect(window.location.reload).toHaveBeenCalled();
    });

    test('should not start download if URL input is empty', () => {
        const downloadBtn = document.getElementById('download-btn');
        window.alert = jest.fn(); // Mock alert
        downloadBtn.click();
        expect(window.alert).toHaveBeenCalledWith('กรุณาใส่ URL ของวิดีโอ');
        expect(global.EventSource).not.toHaveBeenCalled();
    });
});
