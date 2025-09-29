@echo off
setlocal enabledelayedexpansion

REM Change console code page to UTF-8 to support Thai characters in filenames
chcp 65001 > nul

REM === Configuration ===
REM Set the path to your project's src directory. %~dp0 is the directory where this script is located.
set "PROJECT_SRC_DIR=%~dp0src"

REM Set paths for the download list, output directory, and JSON file
set "DOWNLOAD_LIST=%~dp0download_list.txt"
set "OUTPUT_DIR=%PROJECT_SRC_DIR%\videos"
set "JSON_OUTPUT_FILE=%PROJECT_SRC_DIR%\data\videos.json"

REM yt-dlp options
set "YTDLP_FORMAT=bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
set "YTDLP_OUTPUT_TEMPLATE=%%(title)s.%%(ext)s"
set "YTDLP_MERGE_FORMAT=mp4"

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

REM Check for ffmpeg, which is needed for merging best quality streams
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] ffmpeg.exe could not be found in your system's PATH.
    echo           Merging video and audio might fail.
    echo           Please install FFmpeg from https://ffmpeg.org/download.html and add it to your PATH.
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

echo [INFO] Preparing to generate %JSON_OUTPUT_FILE%
REM Start JSON file with an opening bracket
echo [ > "%JSON_OUTPUT_FILE%"

echo [INFO] Starting video downloads and JSON generation...
echo.

set "first_entry=true"

REM Loop through each URL in the download list
for /f "usebackq delims=" %%u in ("%DOWNLOAD_LIST%") do (
    echo --------------------------------------------------
    echo [INFO] Processing URL: %%u

    echo [INFO] Downloading and getting metadata for %%u
    REM Download video and dump metadata to a temp file in one go
    yt-dlp.exe "%%u" ^
        -o "%OUTPUT_DIR%\%YTDLP_OUTPUT_TEMPLATE%" ^
        -f "%YTDLP_FORMAT%" ^
        --merge-output-format "%YTDLP_MERGE_FORMAT%"

    if !errorlevel! equ 0 (
        echo [INFO] Appending to JSON...
        REM Add comma before the entry if it's not the first one
        if not "!first_entry!"=="true" (
            echo , >> "%JSON_OUTPUT_FILE%"
        )

        set "first_entry=false"

        REM Extract info from the temp metadata file and append to our main videos.json
        REM This requires a helper script, but for a pure batch solution, we can parse it manually.
        REM A simpler approach is to re-fetch the final filename.
        for /f "delims=" %%i in ('yt-dlp.exe --get-filename -o "%OUTPUT_DIR%\%YTDLP_OUTPUT_TEMPLATE%" --merge-output-format "%YTDLP_MERGE_FORMAT%" "%%u"') do set "final_filename=%%~nxi"
        for /f "delims=" %%i in ('yt-dlp.exe --get-title "%%u"') do set "video_title=%%i"
        for /f "delims=" %%i in ('yt-dlp.exe --get-description "%%u"') do set "video_description=%%i"

        REM Escape special characters for JSON
        set "json_title=!video_title:"=\"!"
        set "json_description=!video_description:"=\"!"
        set "json_description=!json_description:\=\\!"
        set "json_description=!json_description:%%=%%%%!"
        set "json_description=!json_description:"=\"!"
        set "json_description=!json_description:^&=^&!"
        set "json_description=!json_description:<=^<!"
        set "json_description=!json_description:>=^>!"
        set "json_description=!json_description:|=^|!"

        (   echo     {
            echo         "title": "!json_title!",
            echo         "description": "!json_description!",
            echo         "filePath": "videos/!final_filename!"
            echo     } )>> "%JSON_OUTPUT_FILE%"
    ) else (
        echo [WARNING] Failed to download or process %%u. Skipping.
    )
    echo.
)

REM Close the JSON array
echo ]>> "%JSON_OUTPUT_FILE%"

echo.
echo [SUCCESS] All downloads are complete.
echo [SUCCESS] videos.json has been generated at: %JSON_OUTPUT_FILE%
pause