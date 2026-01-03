@echo off
title VDO4Dad Server
cd /d "%~dp0"

echo ==========================================
echo      VDO4Dad - Offline Video App
echo ==========================================
echo.

if not exist "node_modules" (
    echo Installing dependencies - First run only...
    call npm install
)

echo Starting application...
call npm run dev-full
echo.
cmd /k