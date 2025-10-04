const EventSource = require('eventsource');

// URL ของวิดีโอที่ต้องการทดสอบ (ควรเลือกวิดีโอสั้นๆ เพื่อให้ทดสอบได้เร็ว)
const testVideoUrl = 'https://www.youtube.com/watch?v=LXb3EKWsInQ'; // ตัวอย่าง: วิดีโอสั้นๆ

const downloadUrl = `http://localhost:3000/download?url=${encodeURIComponent(testVideoUrl)}`;

console.log(`▶️  Starting download test for: ${testVideoUrl}`);
console.log(`🔌 Connecting to: ${downloadUrl}\n`);

const eventSource = new EventSource(downloadUrl);

let lastProgress = -1;

eventSource.onopen = () => {
    console.log("✅ Connection to server opened.");
};

eventSource.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'start':
                console.log(`[START] ${data.message}`);
                break;
            case 'progress':
                const percent = Math.round(data.percent);
                if (percent > lastProgress) {
                    console.log(`[PROGRESS] ${percent}% ...`);
                    lastProgress = percent;
                }
                break;
            case 'done':
                console.log(`\n[DONE] ✅ Download successful!`);
                console.log(`   Title: ${data.title}`);
                console.log(`   File Path: ${data.filePath}`);
                eventSource.close();
                break;
            case 'error':
                console.error(`\n[ERROR] ❌ ${data.message}`);
                eventSource.close();
                break;
        }
    } catch (error) {
        console.error("🚨 Error parsing message data:", event.data);
    }
};

eventSource.onerror = (err) => {
    console.error("\n❌ EventSource failed:", err.message || 'Could not connect to the server. Is the backend running?');
    eventSource.close();
};
