@echo off
title HeurisAgent Production Launcher
color 0A
echo ==========================================================
echo       HeurisAgent Production Mode (Multi-Agent Platform)
echo ==========================================================
echo.

:: Check pnpm
where pnpm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] pnpm not found.
    echo [INFO]  Run:  npm install -g pnpm
    pause
    exit /b 1
)

:: Pull latest code from git
echo [INFO] Pulling latest code...
git pull

:: Install deps if needed
if not exist node_modules\.bin\next.cmd (
    echo [INFO] Installing production dependencies...
    pnpm install
    if errorlevel 1 (
        echo [ERROR] pnpm install failed.
        pause
        exit /b 1
    )
)

:: Build production (Always build latest)
echo [INFO] Cleaning old build...
if exist .next rmdir /s /q .next
echo [INFO] Building production...
pnpm build
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

:: For standalone mode, copy static assets so they are served correctly
if exist .next\standalone (
    echo [INFO] Copying public folder to standalone...
    xcopy /E /I /Q /Y public .next\standalone\public >nul 2>nul
    
    echo [INFO] Copying static folder to standalone...
    xcopy /E /I /Q /Y .next\static .next\standalone\.next\static >nul 2>nul
)

:: Kill anything already on port 5000
echo [INFO] Clearing port 5000...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>nul
)

echo [INFO] Starting production server at http://localhost:5000
echo.

:: Run standalone server if available, else next start
if exist .next\standalone\server.js (
    echo [INFO] Running optimized standalone server...
    set PORT=5000
    node .next\standalone\server.js
) else (
    echo [INFO] Running standard next server...
    node_modules\.bin\next.cmd start -p 5000
)

:: If next.cmd exits on its own, show error
echo.
echo [WARN] Server stopped. Check the output above for errors.
pause
