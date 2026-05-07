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

:: Build if needed
if not exist .next (
    echo [INFO] Production build not found. Building...
    pnpm build
    if errorlevel 1 (
        echo [ERROR] Build failed.
        pause
        exit /b 1
    )
) else (
    echo [INFO] Production build found.
    echo [INFO] Note: If you updated the code, please delete the .next folder or run "pnpm build" manually before starting.
)

:: For standalone mode, copy static assets so they are served correctly
if exist .next\standalone (
    if not exist .next\standalone\public (
        echo [INFO] Copying public folder to standalone...
        xcopy /E /I /Q public .next\standalone\public >nul 2>nul
    )
    if not exist .next\standalone\.next\static (
        echo [INFO] Copying static folder to standalone...
        xcopy /E /I /Q .next\static .next\standalone\.next\static >nul 2>nul
    )
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
