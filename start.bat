@echo off
chcp 65001 >nul
title 启发式学习智能体

echo.
echo  ========================================
echo    启发式学习智能体 - 一键启动
echo  ========================================
echo.

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 未检测到 pnpm，正在安装...
    npm install -g pnpm
)

if not exist "node_modules" (
    echo [*] 首次运行，安装依赖（约 1-2 分钟）...
    call pnpm install
)

if not exist "apps\api\node_modules" (
    echo [*] 安装后端依赖...
    call pnpm install
)

echo.
echo [*] 启动服务...
echo     前端: http://localhost:5000
echo     后端: http://localhost:5001
echo.
echo     按 Ctrl+C 停止
echo.

call pnpm dev
