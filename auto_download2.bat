@echo off

REM ตั้งค่าตำแหน่งของโปรแกรม (สมมติว่า yt-dlp.exe อยู่ในโฟลเดอร์เดียวกัน)
set YTDLP_PATH=yt-dlp.exe

REM ตั้งค่าโฟลเดอร์ปลายทางสำหรับการดาวน์โหลด
set DOWNLOAD_DIR=D:\YouTube_Offline_Videos

REM ตรวจสอบและสร้างโฟลเดอร์ปลายทางถ้ายังไม่มี
if not exist "%DOWNLOAD_DIR%" mkdir "%DOWNLOAD_DIR%"

REM รัน yt-dlp เพื่อดาวน์โหลด URL ในไฟล์ download_list.txt
REM -a: อ่าน URL จากไฟล์
REM -P: ตั้งค่าโฟลเดอร์ปลายทาง
REM -i: ดำเนินการต่อแม้มีข้อผิดพลาด
REM -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best": เลือกคุณภาพดีที่สุดแบบ MP4
REM --embed-thumbnail: ฝังภาพปกวิดีโอลงในไฟล์
REM --add-metadata: เพิ่มข้อมูลวิดีโอ (ชื่อ, คำอธิบาย)
REM --ffmpeg-location: ระบุตำแหน่งของ FFmpeg (จำเป็นสำหรับการรวมไฟล์)

echo เริ่มการดาวน์โหลด...
"%YTDLP_PATH%" -a "download_list.txt" -P "%DOWNLOAD_DIR%" -i -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --embed-thumbnail --add-metadata --ffmpeg-location "ffmpeg.exe"

echo การดาวน์โหลดเสร็จสิ้น
pause