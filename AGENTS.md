# 多智能体启发式学习平台

## 项目概览

基于多智能体协作的启发式学习平台，包含课堂互动、错题管理、复习策略三大智能体，支持教学资源共享和智能体间数据协同。

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **数据库**: Supabase (PostgreSQL)
- **LLM**: coze-coding-dev-sdk (豆包 Seed 系列)

## 目录结构

```
├── public/                          # 静态资源
├── scripts/                         # 构建与启动脚本
├── src/
│   ├── app/                         # 页面路由与布局
│   │   ├── page.tsx                 # 仪表盘首页
│   │   ├── layout.tsx               # 根布局
│   │   ├── classroom/page.tsx       # 课堂互动页
│   │   ├── errors/page.tsx          # 错题管理页
│   │   ├── review/page.tsx          # 复习策略页
│   │   ├── resources/page.tsx       # 资源管理页
│   │   ├── monitor/page.tsx         # 智能体监控页
│   │   └── api/                     # API 路由
│   │       ├── classroom/route.ts        # 课堂互动智能体 (SSE 流式)
│   │       ├── classroom/sessions/route.ts # 课堂会话管理
│   │       ├── errors/route.ts           # 错题管理智能体
│   │       ├── review/route.ts           # 复习策略智能体
│   │       ├── resources/route.ts        # 教学资源 CRUD
│   │       ├── agent-tasks/route.ts      # 智能体协同任务
│   │       └── dashboard/route.ts        # 仪表盘统计数据
│   ├── components/                  # 页面组件
│   │   ├── app-layout.tsx          # 全局侧边栏布局
│   │   ├── dashboard-page.tsx      # 仪表盘组件
│   │   ├── classroom-page.tsx      # 课堂互动组件
│   │   ├── errors-page.tsx         # 错题管理组件
│   │   ├── review-page.tsx         # 复习策略组件
│   │   ├── resources-page.tsx      # 资源管理组件
│   │   ├── monitor-page.tsx        # 智能体监控组件
│   │   └── ui/                     # shadcn/ui 组件库
│   ├── storage/database/           # 数据库
│   │   ├── supabase-client.ts      # Supabase 客户端
│   │   └── shared/schema.ts        # Drizzle Schema
│   ├── hooks/                      # 自定义 Hooks
│   └── lib/utils.ts                # 工具函数
├── next.config.ts
├── package.json
└── tsconfig.json
```

## 构建和测试命令

- **安装依赖**: `pnpm install`
- **开发**: `pnpm dev` (端口 5000)
- **构建**: `pnpm build`
- **生产启动**: `pnpm start`
- **类型检查**: `pnpm ts-check`
- **代码检查**: `pnpm lint`

## 数据库表结构

| 表名 | 说明 |
|------|------|
| learning_resources | 教学资源库 |
| classroom_sessions | 课堂会话 |
| classroom_messages | 课堂消息记录 |
| error_questions | 错题记录 |
| review_plans | 复习计划 |
| learning_records | 学习记录 |
| agent_tasks | 智能体协同任务 |

## API 接口清单

| 路径 | 方法 | 说明 |
|------|------|------|
| /api/classroom | POST | 课堂互动对话（SSE流式） |
| /api/classroom/sessions | GET/POST | 获取/创建课堂会话 |
| /api/errors | GET/POST | 获取错题列表/提交错题分析 |
| /api/review | GET/POST | 获取/生成复习计划 |
| /api/resources | GET/POST | 获取/创建教学资源 |
| /api/agent-tasks | GET/POST | 获取/创建智能体协同任务 |
| /api/dashboard | GET | 获取仪表盘统计数据 |

## 代码风格指南

- TypeScript strict 模式，禁止隐式 any
- LLM 消息角色类型显式声明: `{ role: "system" | "user" | "assistant"; content: string }`
- SSE 流式响应: Content-Type 为 `text/event-stream`
- Supabase 使用 service_role_key 后端访问，RLS 已启用
- 组件使用 'use client' + useEffect/useState 避免 hydration 问题
