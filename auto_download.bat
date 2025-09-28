:: สคริปต์สุ่มดาวน์โหลด YouTube วิดีโอเกี่ยวกับละครฟื้นฟูศีลธรรมโลก
:: ต้องมี yt-dlp.exe ในโฟลเดอร์เดียวกัน

@echo off
setlocal enabledelayedexpansion

:: คำค้นหา
set SEARCH="ละครฟื้นฟูศีลธรรมโลก"

:: ค้นหา YouTube และบันทึกลิงก์วิดีโอลงไฟล์
yt-dlp --default-search ytsearch5 "cute cat videos" > video_ids.txt

@echo สุ่มดาวน์โหลดเสร็จสิ้น
pause
