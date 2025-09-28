@echo off
setlocal

REM === Configuration ===
REM Set the path to your project's src directory. %~dp0 is the directory where this script is located.
set "PROJECT_SRC_DIR=%~dp0src"

REM Set the path for the downloads list and the output directory
set "DOWNLOAD_LIST=%~dp0download_list.txt"
set "OUTPUT_DIR=%PROJECT_SRC_DIR%\videos"

REM === Script Logic ===

echo ========================================
echo      Video Downloader using yt-dlp
echo ========================================
echo.

REM Check if yt-dlp is installed/available in PATH
where yt-dlp >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] yt-dlp could not be found in your system's PATH.
    echo Please install it from: https://github.com/yt-dlp/yt-dlp
    goto :eof
)

REM Check if download list exists
if not exist "%DOWNLOAD_LIST%" (
    echo [ERROR] Download list not found at: %DOWNLOAD_LIST%
    goto :eof
)

REM Create the output directory if it doesn't exist
if not exist "%OUTPUT_DIR%" (
    echo [INFO] Creating video directory: %OUTPUT_DIR%
    mkdir "%OUTPUT_DIR%"
)

echo [INFO] Starting video downloads from %DOWNLOAD_LIST%
echo [INFO] Videos will be saved to: %OUTPUT_DIR%
echo.

REM Run yt-dlp to download all videos from the list
yt-dlp.exe --batch-file "%DOWNLOAD_LIST%" -o "%OUTPUT_DIR%\%(title)s.%(ext)s" -f "bestvideo[height<=720]+bestaudio/best" --merge-output-format mp4

echo.
echo [SUCCESS] All downloads are complete.
pause