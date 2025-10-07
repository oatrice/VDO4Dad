# Changelog - VDO4Dad Download Queue Manager

## Phase 1 - Completed Features

### ✅ Core Features (2025-10-07)

#### 1. Queue Management System
- **Data Persistence**: ข้อมูลคิวถูกบันทึกใน `/src/data/queue_data.json`
- **Recovery Logic**: กู้คืนสถานะอัตโนมัติเมื่อ server restart
- **Status Tracking**: 5 สถานะ (PENDING, DOWNLOADING, PAUSED, FAILED, COMPLETED)

#### 2. Backend API
- `GET /api/queue` - ดึงข้อมูลคิวทั้งหมด
- `POST /api/queue` - เพิ่มรายการเข้าคิว (พร้อมดึง metadata)
- `DELETE /api/queue` - ลบคิวทั้งหมด

#### 3. Frontend UI
- **Queue Display**: แสดงคิวแนวนอนแบบ scrollable
- **Thumbnail & Title**: แสดงภาพและชื่อวิดีโอ
- **Status Badges**: แสดงสถานะพร้อมสีสัน
- **Progress Bar**: แสดงความคืบหน้า (เตรียมไว้สำหรับ Phase 2)

#### 4. User Interactions
- **Add Multiple URLs**: รองรับหลาย URLs (comma, newline)
- **Keyboard Shortcut**: Ctrl+Enter (Cmd+Enter) เพื่อเพิ่มเข้าคิว
- **Clear All Button**: ลบคิวทั้งหมดพร้อม confirmation
- **Loading States**: แสดง spinner animation ขณะประมวลผล

#### 5. UI/UX Improvements
- **Horizontal Scrollable Queue**: แสดงคิวแนวนอนแบบ carousel
- **Custom Scrollbar**: scrollbar สวยงาม
- **Hover Effects**: card ยกขึ้นเมื่อ hover
- **Empty State**: แสดงข้อความเมื่อไม่มีรายการ
- **Responsive Design**: รองรับ mobile/tablet

#### 6. Loading Animations
- **Button Loading**: spinner ในปุ่มขณะประมวลผล
- **Queue Loading**: แสดง loading state พร้อมข้อความ
- **Smooth Transitions**: animation ที่ลื่นไหล

---

## Technical Details

### File Structure
```
/src/
  /data/
    queue_data.json       # Queue database
    videos.json           # Video list
  /styles/
    main.css              # All styles including queue
  /videos/                # Downloaded videos
  app.js                  # Frontend logic
  index.html              # Main UI
/server.js                # Backend API
/QUEUE_STRUCTURE.md       # Data structure docs
/PHASE1_SUMMARY.md        # Phase 1 summary
/CHANGELOG.md             # This file
```

### API Endpoints
```
GET    /api/queue        # Get all queue items
POST   /api/queue        # Add item to queue
DELETE /api/queue        # Clear all queue items
```

### Queue Item Structure
```json
{
  "id": "queue-xxx",
  "url": "https://...",
  "title": "Video Title",
  "thumbnail": "https://...",
  "status": "PENDING",
  "progress": 0,
  "pid": null,
  "filePath": null,
  "error": null,
  "addedAt": "2025-10-07T...",
  "startedAt": null,
  "completedAt": null
}
```

---

## Next Phase (Phase 2)

### Planned Features
- [ ] Start Download from Queue
- [ ] Pause/Resume Downloads
- [ ] Cancel Downloads
- [ ] Retry Failed Downloads
- [ ] Remove Individual Items
- [ ] Real-time Progress Updates
- [ ] Download Queue Processor
- [ ] Concurrent Download Limit

---

## Bug Fixes & Improvements

### 2025-10-07
- ✅ Fixed duplicate code (removed legacy download system)
- ✅ Consolidated UI to use single textarea
- ✅ Moved queue_data.json to /src/data/
- ✅ Added loading animations
- ✅ Added Clear All button
- ✅ Improved responsive design
- ✅ Added horizontal scrollable queue

---

## Known Issues
- None at the moment

---

## Credits
- Built with Express.js, yt-dlp-wrap
- UI inspired by modern web design principles
