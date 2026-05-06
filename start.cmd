@echo off
title HeurisAgent Launcher
color 0B
echo ==========================================================
echo           HeurisAgent Multi-Agent Learning Platform
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
    echo [INFO] Installing dependencies...
    pnpm install
    if errorlevel 1 (
        echo [ERROR] pnpm install failed.
        pause
        exit /b 1
    )
)

:: Kill anything already on port 5000
echo [INFO] Clearing port 5000...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>nul
)

echo [INFO] Starting dev server at http://localhost:5000
echo.

:: Run next dev directly — do NOT use setlocal/endlocal around a long-lived process
:: Do NOT use `call` so Ctrl+C closes cleanly without showing "Terminate batch job?"
node_modules\.bin\next.cmd dev -p 5000

:: If next.cmd exits on its own (not Ctrl+C), show error
echo.
echo [WARN] Server stopped. Check the output above for errors.
pause
