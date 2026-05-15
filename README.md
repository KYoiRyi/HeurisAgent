# 启发式学习智能体

课堂互动 / 错题管理 / 复习策略 三智能体一体化平台。

## 环境要求

- Node.js >= 20
- pnpm >= 9（没有则运行 `npm install -g pnpm`）

## 一键启动

Windows:
```
start.bat
```

或手动：
```bash
pnpm install
pnpm dev
```

启动后打开 http://localhost:5000

## 配置 LLM

首次启动默认使用 MiniMax API。进入「AI 设置」页面可切换为 DeepSeek / OpenAI 兼容 / 本地 Ollama。

## 目录结构

```
apps/api/    NestJS 后端（端口 5001）
apps/web/    Vite + React 前端（端口 5000）
data/        运行时数据（自动创建，gitignore）
```
