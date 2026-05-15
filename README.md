# HeurisAgent

启发式学业智能体 — 课堂互动 / 错题管理 / 复习策略 三智能体一体化平台。

## 当前状态

正在从 Next.js 单仓库迁往 NestJS 后端 + Vite 前端的双进程架构。本提交完成了**阶段 1：脚手架与清理**。

```
HeurisAgent/
├─ apps/
│  ├─ api/                  # NestJS 后端
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ persistence/    # PGlite + Drizzle (统一 PG schema)
│  │  │  ├─ runtime/        # AgentEventBus + AgentRuntimeService
│  │  │  ├─ modules/
│  │  │  │  ├─ health/
│  │  │  │  └─ agent/       # /api/agent/status, /api/agent/events (SSE)
│  │  │  ├─ llm/
│  │  │  │  ├─ pi-ai/       # 多 provider LLM 客户端 (从旧仓搬入)
│  │  │  │  └─ pi-agent/    # Agent 内核 (从旧仓搬入)
│  │  │  └─ legacy/         # 待迁移的旧业务代码
│  │  ├─ drizzle.config.ts
│  │  ├─ nest-cli.json
│  │  └─ tsconfig.json
│  └─ web/                  # Vite + React + React Router 7
│     ├─ src/
│     │  ├─ main.tsx
│     │  ├─ App.tsx
│     │  ├─ routes/         # /, /classroom, /errors, /review, /resources, /memory, /settings
│     │  ├─ components/     # app-layout + 全套 shadcn/ui
│     │  ├─ lib/            # api.ts (REST + SSE), utils.ts
│     │  └─ hooks/
│     ├─ index.html
│     ├─ vite.config.ts
│     └─ components.json    # shadcn 配置
├─ data/                    # PGlite 数据 + sessions + skills
├─ package.json             # 工作区根, concurrently 一键启动
├─ pnpm-workspace.yaml
└─ README.md
```

## 一键启动

```bash
pnpm install
pnpm dev          # 同时启动 Nest (5001) 与 Vite (5000)
```

打开 <http://localhost:5000> 即可。Vite dev server 会把 `/api/*` 与 `/health` 代理到 Nest 5001。

生产模式：

```bash
pnpm build        # 先 build web, 再 build api
pnpm start        # 单进程启动 Nest, 内嵌静态前端
```

`apps/web` build 产物位于 `apps/web/dist/`，Nest 在生产模式下通过 `ServeStaticModule` 自动托管。

## 数据库

- 嵌入式 PostgreSQL：`@electric-sql/pglite`
- 数据目录：`data/pgdata/`（首次启动自动创建）
- ORM：`drizzle-orm`
- Schema：[apps/api/src/persistence/schema.ts](apps/api/src/persistence/schema.ts)
- 首次启动自动执行 [apps/api/src/persistence/bootstrap-ddl.ts](apps/api/src/persistence/bootstrap-ddl.ts)
- FTS：`memories.fts` (`tsvector + GIN`)，由触发器维护

后续要 schema 演进：

```bash
pnpm db:generate    # 生成 SQL migration 至 apps/api/drizzle/
pnpm db:migrate     # 应用迁移
```

## 环境变量

```bash
PORT=5001            # Nest 监听端口（默认 5001）
DATA_DIR=./data      # PGlite 数据目录
```

## 迁移路线（本次提交后剩余阶段）

- **阶段 2**：把 `apps/api/src/legacy/` 中的 `memory.ts / resources.ts / classroom-history.ts / review-plans.ts / model-config.ts / heuris-agent.ts` 重写为 Nest Service，全部走 Drizzle。
- **阶段 3**：按模块逐个上线 — memory → resources → classroom-history → classroom (SSE) → errors → review → agent-tasks → dashboard → settings → openai-compat。
- **阶段 4**：前端按路由替换占位组件，对接 Nest API。
- **阶段 5**：删除 `apps/api/src/legacy/`、`_legacy/`，回归测试。

## 已删除 / 已迁移

- `src/server.ts`、Next.js 全套（`next.config.ts` / `next-env.d.ts` / `postcss.config.mjs` / `eslint.config.mjs`）
- `src/storage/database/supabase-client.ts` 与 `@supabase/supabase-js`
- `src/lib/db.ts` (better-sqlite3) 与所有 SQLite 依赖
- 全部 `src/app/api/**` 路由（行为已规划入 Nest 模块）
- `src/lib/agent-runtime.ts` 兼容 shim
- `start.cmd / start-prod.cmd / scripts/*.sh`、`tsbuildinfo`、Word 设计稿
