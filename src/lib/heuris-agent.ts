/**
 * heuris-agent.ts — HeurisAgent singleton powered by @mariozechner/pi-agent-core
 *
 * Replaces the manual agent-runtime.ts loop with a proper:
 *   - pi-agent Agent (stateful, lifecycle events, steering queues)
 *   - Parallel tool execution (add_memory, schedule_cron_job, search_memory)
 *   - SSE event bus (unchanged interface from AgentRuntime)
 *   - Cron scheduler (unchanged)
 *
 * The exported `agentRuntime` object is drop-in compatible with the original
 * AgentRuntime singleton used throughout the codebase.
 */
import { Type } from "typebox";
import type { Static } from "typebox";
import { Agent } from "@/lib/pi-agent/agent";
import type { AgentTool, AgentEvent as PiAgentEvent } from "@/lib/pi-agent/types";
import type { AssistantMessage } from "@/lib/pi-ai/index";
import { getActiveModel, getActiveApiKey } from "./model-config";
import { getDb } from "./db";
import { memoryStore } from "./memory";

// ── Event bus for SSE clients ────────────────────────────────────────────────

export interface AgentEvent {
  type: "task_start" | "task_done" | "task_error" | "status" | "tool_start" | "tool_end" | "stream_chunk";
  payload: Record<string, unknown>;
  ts: string;
}

type EventListener = (event: AgentEvent) => void;

class EventBus {
  private listeners = new Set<EventListener>();

  subscribe(fn: EventListener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event: AgentEvent) {
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch {
        /* ignore broken listeners */
      }
    }
  }
}

export const agentEvents = new EventBus();

// ── CronJob row type ─────────────────────────────────────────────────────────

interface CronJobRow {
  id: number;
  name: string;
  schedule: string;
  prompt: string;
  enabled: number;
  last_run: string | null;
  next_run: string | null;
  run_count: number;
  created_at: string;
}

// ── Schedule parsing ─────────────────────────────────────────────────────────

function parseScheduleMs(schedule: string): number | null {
  const s = schedule.trim().toLowerCase();
  const everyHour = s.match(/every\s+(\d+)\s*h/);
  if (everyHour) return parseInt(everyHour[1]) * 60 * 60 * 1000;
  const everyMin = s.match(/every\s+(\d+)\s*(min|minute)/);
  if (everyMin) return parseInt(everyMin[1]) * 60 * 1000;
  const everyDay = s.match(/every\s+(\d+)\s*d/);
  if (everyDay) return parseInt(everyDay[1]) * 24 * 60 * 60 * 1000;
  if (s === "daily" || s === "every day") return 24 * 60 * 60 * 1000;
  if (s === "hourly" || s === "every hour") return 60 * 60 * 1000;
  if (s === "every 30 minutes" || s === "every 30min") return 30 * 60 * 1000;
  if (/^[\d\s*/,\-]+$/.test(s)) return 60 * 60 * 1000;
  return null;
}

function isDue(job: CronJobRow): boolean {
  if (!job.next_run) return true;
  return new Date(job.next_run) <= new Date();
}

function computeNextRun(schedule: string): string {
  const ms = parseScheduleMs(schedule);
  return new Date(Date.now() + (ms ?? 60 * 60 * 1000)).toISOString();
}

// ── Domain Tool Definitions (TypeBox schemas) ────────────────────────────────

const AddMemorySchema = Type.Object({
  content: Type.String({ description: "The content to remember." }),
  tags: Type.Optional(Type.Array(Type.String(), { description: "Topic tags." })),
});

const ScheduleCronJobSchema = Type.Object({
  name: Type.String({ description: "Name of the task." }),
  schedule: Type.String({ description: "When to run, e.g. 'every 2h', 'daily'." }),
  prompt: Type.String({ description: "The instructions for the background task." }),
});

const SearchMemorySchema = Type.Object({
  query: Type.String({ description: "Query to search memories for." }),
  limit: Type.Optional(Type.Number({ description: "Max results, default 8." })),
});

function buildHeurisTools(): AgentTool[] {
  const addMemoryTool: AgentTool<typeof AddMemorySchema> = {
    name: "add_memory",
    label: "Save Memory",
    description: "Save an important piece of information to long-term memory for future use.",
    parameters: AddMemorySchema,
    execute: async (_id, params: Static<typeof AddMemorySchema>) => {
      memoryStore.add(params.content, {
        source: "agent_tool",
        importance: 2,
        tags: params.tags ?? [],
      });
      console.log(`[HeurisAgent] add_memory: ${params.content.substring(0, 80)}`);
      return {
        content: [{ type: "text", text: "Memory saved successfully." }],
        details: { saved: true, content: params.content },
      };
    },
  };

  const scheduleCronJobTool: AgentTool<typeof ScheduleCronJobSchema> = {
    name: "schedule_cron_job",
    label: "Schedule Task",
    description: "Schedule a future background task.",
    parameters: ScheduleCronJobSchema,
    execute: async (_id, params: Static<typeof ScheduleCronJobSchema>) => {
      const db = getDb();
      db.prepare(
        `INSERT INTO cron_jobs (name, schedule, prompt, enabled, next_run) VALUES (?, ?, ?, 1, ?)`
      ).run(params.name, params.schedule, params.prompt, computeNextRun(params.schedule));
      console.log(`[HeurisAgent] schedule_cron_job: ${params.name}`);
      return {
        content: [{ type: "text", text: `Cron job '${params.name}' scheduled for ${params.schedule}.` }],
        details: { scheduled: true, name: params.name, schedule: params.schedule },
      };
    },
  };

  const searchMemoryTool: AgentTool<typeof SearchMemorySchema> = {
    name: "search_memory",
    label: "Search Memory",
    description: "Search long-term memory for relevant context.",
    parameters: SearchMemorySchema,
    execute: async (_id, params: Static<typeof SearchMemorySchema>) => {
      const ctx = memoryStore.buildContext(params.query, params.limit ?? 8);
      return {
        content: [{ type: "text", text: ctx || "No relevant memories found." }],
        details: { query: params.query, found: !!ctx },
      };
    },
  };

  return [addMemoryTool, scheduleCronJobTool, searchMemoryTool];
}

// ── HeurisAgentRuntime ────────────────────────────────────────────────────────

class HeurisAgentRuntime {
  private _running = false;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private readonly POLL_INTERVAL_MS = 30_000;

  get isRunning() {
    return this._running;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._tick();
    this._timer = setInterval(() => this._tick(), this.POLL_INTERVAL_MS);
    agentEvents.emit({
      type: "status",
      payload: { running: true, message: "HeurisAgent daemon started (pi-agent powered)" },
      ts: new Date().toISOString(),
    });
    console.log("[HeurisAgent] started");
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    agentEvents.emit({
      type: "status",
      payload: { running: false, message: "HeurisAgent daemon stopped" },
      ts: new Date().toISOString(),
    });
    console.log("[HeurisAgent] stopped");
  }

  /** Run a one-shot task immediately (from UI or API) */
  async runTask(
    prompt: string,
    opts: { jobId?: number; trigger?: string } = {}
  ): Promise<string> {
    const db = getDb();
    const runRow = db
      .prepare(
        `INSERT INTO task_runs (job_id, trigger, prompt, status) VALUES (?, ?, ?, 'running')`
      )
      .run(opts.jobId ?? null, opts.trigger ?? "manual", prompt);
    const runId = runRow.lastInsertRowid as number;

    agentEvents.emit({
      type: "task_start",
      payload: { runId, prompt: prompt.substring(0, 120) },
      ts: new Date().toISOString(),
    });

    try {
      // Build memory context
      const memCtx = memoryStore.buildContext(prompt, 8);
      const systemPrompt =
        "你是 HeurisAgent 后台任务执行智能体。请认真完成用户分配的任务，给出简洁且有用的结果。\n\n" +
        (memCtx ? memCtx + "\n\n" : "") +
        "当前时间：" +
        new Date().toLocaleString("zh-CN");

      // Create a fresh Agent per task to avoid shared state across concurrent tasks
      const model = getActiveModel();
      const apiKey = getActiveApiKey();
      const agent = new Agent({
        initialState: {
          systemPrompt,
          model,
          tools: buildHeurisTools(),
        },
        getApiKey: () => apiKey,
        toolExecution: "parallel",
      });

      // Collect all assistant text as the "result"
      let finalResult = "";
      let totalTokens = 0;

      // Subscribe to agent events to forward to SSE bus
      agent.subscribe((event: PiAgentEvent) => {
        if (event.type === "tool_execution_start") {
          agentEvents.emit({
            type: "tool_start",
            payload: { runId, toolName: event.toolName, args: event.args },
            ts: new Date().toISOString(),
          });
        } else if (event.type === "tool_execution_end") {
          agentEvents.emit({
            type: "tool_end",
            payload: { runId, toolName: event.toolName, isError: event.isError },
            ts: new Date().toISOString(),
          });
        } else if (event.type === "message_end") {
          const msg = event.message as AssistantMessage;
          if (msg.role === "assistant") {
            const text = msg.content
              .filter((c) => c.type === "text")
              .map((c) => (c as { type: "text"; text: string }).text)
              .join("");
            if (text) {
              finalResult += (finalResult ? "\n" : "") + text;
            }
            totalTokens += msg.usage?.totalTokens ?? 0;
          }
        }
      });

      await agent.prompt(prompt);

      db.prepare(
        `UPDATE task_runs SET status='done', result=?, finished_at=datetime('now'), tokens_used=? WHERE id=?`
      ).run(finalResult, totalTokens, runId);

      // Auto-store notable results as memories
      if (finalResult.length > 50) {
        memoryStore.add(
          `[任务结果] ${prompt.substring(0, 60)}…\n${finalResult.substring(0, 300)}`,
          { source: "cron", importance: 1, tags: ["task-result"] }
        );
      }

      agentEvents.emit({
        type: "task_done",
        payload: { runId, result: finalResult.substring(0, 500) },
        ts: new Date().toISOString(),
      });

      return finalResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db.prepare(
        `UPDATE task_runs SET status='failed', result=?, finished_at=datetime('now') WHERE id=?`
      ).run(msg, runId);
      agentEvents.emit({
        type: "task_error",
        payload: { runId, error: msg },
        ts: new Date().toISOString(),
      });
      throw err;
    }
  }

  private async _tick() {
    if (!this._running) return;
    const db = getDb();
    const jobs = db
      .prepare(`SELECT * FROM cron_jobs WHERE enabled=1`)
      .all() as CronJobRow[];

    for (const job of jobs) {
      if (!isDue(job)) continue;
      db.prepare(
        `UPDATE cron_jobs SET next_run=?, last_run=datetime('now'), run_count=run_count+1 WHERE id=?`
      ).run(computeNextRun(job.schedule), job.id);
      this.runTask(job.prompt, { jobId: job.id, trigger: "cron" }).catch((err) => {
        console.error(`[HeurisAgent] cron job ${job.id} failed:`, err);
      });
    }
  }

  status() {
    const db = getDb();
    const jobCount = (
      db.prepare("SELECT COUNT(*) as c FROM cron_jobs WHERE enabled=1").get() as { c: number }
    ).c;
    const runningTasks = (
      db.prepare("SELECT COUNT(*) as c FROM task_runs WHERE status='running'").get() as { c: number }
    ).c;
    const recentRuns = db
      .prepare("SELECT * FROM task_runs ORDER BY started_at DESC LIMIT 10")
      .all();
    return {
      running: this._running,
      jobCount,
      runningTasks,
      memoryCount: memoryStore.count(),
      recentRuns,
    };
  }
}

/** Singleton — shared across all API route handler invocations in same process */
export const agentRuntime = new HeurisAgentRuntime();

// Re-export as AgentRuntime for any code that imports the class name
export { HeurisAgentRuntime as AgentRuntime };
