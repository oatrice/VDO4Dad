# Download Queue Manager - Data Structure

## Overview
ระบบ Download Queue Manager ใช้ไฟล์ `queue_data.json` เป็นฐานข้อมูลหลักในการเก็บข้อมูลคิวการดาวน์โหลดทั้งหมด

## File Location
- **Queue Data**: `/src/data/queue_data.json`
- **Videos**: `/src/videos/` (downloaded video files)

## Queue Item Structure

แต่ละรายการในคิวจะมีโครงสร้างดังนี้:

```json
{
  "id": "queue-1234567890-abc123",
  "url": "https://www.youtube.com/watch?v=xxxxx",
  "title": "ชื่อวิดีโอ",
  "thumbnail": "https://i.ytimg.com/vi/xxxxx/maxresdefault.jpg",
  "status": "PENDING",
  "progress": 0,
  "pid": null,
  "filePath": null,
  "error": null,
  "addedAt": "2025-10-07T08:25:00.000Z",
  "startedAt": null,
  "completedAt": null
}
```

## Status Values

| Status | Description | Thai |
|--------|-------------|------|
| `PENDING` | รอการดาวน์โหลด | รอดำเนินการ |
| `DOWNLOADING` | กำลังดาวน์โหลด | กำลังดาวน์โหลด |
| `PAUSED` | หยุดชั่วคราว | หยุดชั่วคราว |
| `FAILED` | ดาวน์โหลดล้มเหลว | ล้มเหลว |
| `COMPLETED` | ดาวน์โหลดสำเร็จ | สำเร็จ |

## Field Descriptions

- **id**: Unique identifier สำหรับแต่ละรายการในคิว
- **url**: URL ของวิดีโอที่ต้องการดาวน์โหลด
- **title**: ชื่อของวิดีโอ (ดึงมาจาก metadata)
- **thumbnail**: URL ของภาพ thumbnail
- **status**: สถานะปัจจุบันของการดาวน์โหลด
- **progress**: เปอร์เซ็นต์ความคืบหน้า (0-100)
- **pid**: Process ID ของ yt-dlp process (null ถ้าไม่ได้ดาวน์โหลด)
- **filePath**: path ของไฟล์วิดีโอที่ดาวน์โหลดแล้ว (null ถ้ายังไม่เสร็จ)
- **error**: ข้อความ error (null ถ้าไม่มี error)
- **addedAt**: เวลาที่เพิ่มเข้าคิว (ISO 8601 format)
- **startedAt**: เวลาที่เริ่มดาวน์โหลด (null ถ้ายังไม่เริ่ม)
- **completedAt**: เวลาที่ดาวน์โหลดเสร็จ (null ถ้ายังไม่เสร็จ)

## Recovery Logic

เมื่อ Server เริ่มทำงาน:

1. โหลดข้อมูลจาก `queue_data.json`
2. ตรวจสอบรายการทั้งหมด
3. รายการที่มีสถานะ `DOWNLOADING` หรือ `PAUSED` จะถูก:
   - เปลี่ยนสถานะเป็น `PENDING`
   - เคลียร์ `pid` (set เป็น null)
   - รีเซ็ต `progress` เป็น 0
4. บันทึกข้อมูลกลับลงไฟล์

## Example Queue Data

```json
[
  {
    "id": "queue-1696680000000-xyz789",
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "title": "Rick Astley - Never Gonna Give You Up",
    "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
    "status": "COMPLETED",
    "progress": 100,
    "pid": null,
    "filePath": "videos/Rick%20Astley%20-%20Never%20Gonna%20Give%20You%20Up.mp4",
    "error": null,
    "addedAt": "2025-10-07T08:00:00.000Z",
    "startedAt": "2025-10-07T08:00:05.000Z",
    "completedAt": "2025-10-07T08:02:30.000Z"
  },
  {
    "id": "queue-1696680100000-abc456",
    "url": "https://www.youtube.com/watch?v=example123",
    "title": "Example Video Title",
    "thumbnail": "https://i.ytimg.com/vi/example123/maxresdefault.jpg",
    "status": "PENDING",
    "progress": 0,
    "pid": null,
    "filePath": null,
    "error": null,
    "addedAt": "2025-10-07T08:05:00.000Z",
    "startedAt": null,
    "completedAt": null
  },
  {
    "id": "queue-1696680200000-def789",
    "url": "https://www.youtube.com/watch?v=failed456",
    "title": "Failed Video Example",
    "thumbnail": "https://i.ytimg.com/vi/failed456/maxresdefault.jpg",
    "status": "FAILED",
    "progress": 45,
    "pid": null,
    "filePath": null,
    "error": "Network connection lost",
    "addedAt": "2025-10-07T08:10:00.000Z",
    "startedAt": "2025-10-07T08:10:05.000Z",
    "completedAt": null
  }
]
```

## API Endpoints

### GET /api/queue
ดึงข้อมูลคิวทั้งหมด

**Response:**
```json
{
  "success": true,
  "queue": [...],
  "count": 3
}
```

## Phase 1 Implementation Status

✅ **Completed:**
- Express Server with CORS and JSON Body Parser
- Queue data persistence (load/save to `queue_data.json`)
- Recovery logic for interrupted downloads
- GET `/api/queue` endpoint
- Automatic queue recovery on server start

**Next Phases:**
- Phase 2: Add queue items via API
- Phase 3: Download management (start, pause, resume, cancel)
- Phase 4: Frontend UI for queue management
