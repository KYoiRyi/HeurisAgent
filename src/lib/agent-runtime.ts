/**
 * AgentRuntime — background agent daemon for HeurisAgent.
 *
 * Singleton that manages:
 *  - Background loop (cron job polling)
 *  - SSE event queue for live feed to the monitor page
 *  - Manual one-shot task execution
 *
 * Inspired by hermes-agent's cron scheduler and skill system.
 */
import { getDb } from "./db";
import { llmInvoke } from "./llm-client";
import { memoryStore } from "./memory";

// ── Event bus for SSE clients ────────────────────────────────────────────────

export interface AgentEvent {
  type: "task_start" | "task_done" | "task_error" | "status";
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
      try { fn(event); } catch { /* ignore broken listeners */ }
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

// ── Next-run calculation ─────────────────────────────────────────────────────

/** Parse human-readable schedule strings to millisecond intervals.
 *  Falls back to treating the string as a cron expression (future: use node-cron). */
function parseScheduleMs(schedule: string): number | null {
  const s = schedule.trim().toLowerCase();

  // "every Nh" / "every N minutes" / "daily" / etc.
  const everyHour = s.match(/every\s+(\d+)\s*h/);
  if (everyHour) return parseInt(everyHour[1]) * 60 * 60 * 1000;

  const everyMin = s.match(/every\s+(\d+)\s*(min|minute)/);
  if (everyMin) return parseInt(everyMin[1]) * 60 * 1000;

  const everyDay = s.match(/every\s+(\d+)\s*d/);
  if (everyDay) return parseInt(everyDay[1]) * 24 * 60 * 60 * 1000;

  if (s === "daily" || s === "every day") return 24 * 60 * 60 * 1000;
  if (s === "hourly" || s === "every hour") return 60 * 60 * 1000;
  if (s === "every 30 minutes" || s === "every 30min") return 30 * 60 * 1000;

  // Simple cron: "0 9 * * *" → daily at 9am → 24h interval (simplified)
  if (/^[\d\s*/,\-]+$/.test(s)) {
    return 60 * 60 * 1000; // default 1h for raw cron expressions (node-cron handles real parsing)
  }

  return null;
}

function isDue(job: CronJobRow): boolean {
  if (!job.next_run) return true;
  return new Date(job.next_run) <= new Date();
}

function computeNextRun(schedule: string): string {
  const ms = parseScheduleMs(schedule);
  const next = new Date(Date.now() + (ms ?? 60 * 60 * 1000));
  return next.toISOString();
}

// ── AgentRuntime ─────────────────────────────────────────────────────────────

class AgentRuntime {
  private _running = false;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private readonly POLL_INTERVAL_MS = 30_000; // check jobs every 30s

  get isRunning() { return this._running; }

  start() {
    if (this._running) return;
    this._running = true;
    this._tick(); // immediate first tick
    this._timer = setInterval(() => this._tick(), this.POLL_INTERVAL_MS);
    agentEvents.emit({
      type: "status",
      payload: { running: true, message: "Background agent daemon started" },
      ts: new Date().toISOString(),
    });
    console.log("[AgentRuntime] started");
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    agentEvents.emit({
      type: "status",
      payload: { running: false, message: "Background agent daemon stopped" },
      ts: new Date().toISOString(),
    });
    console.log("[AgentRuntime] stopped");
  }

  /** Run a one-shot task immediately (from UI or API) */
  async runTask(prompt: string, opts: { jobId?: number; trigger?: string } = {}): Promise<string> {
    const db = getDb();
    const runRow = db.prepare(`
      INSERT INTO task_runs (job_id, trigger, prompt, status)
      VALUES (?, ?, ?, 'running')
    `).run(opts.jobId ?? null, opts.trigger ?? "manual", prompt);
    const runId = runRow.lastInsertRowid as number;

    agentEvents.emit({
      type: "task_start",
      payload: { runId, prompt: prompt.substring(0, 120) },
      ts: new Date().toISOString(),
    });

    try {
      // Inject relevant memories into context
      const memCtx = memoryStore.buildContext(prompt, 8);
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        {
          role: "system",
          content:
            "你是 HeurisAgent 后台任务执行智能体。请认真完成用户分配的任务，给出简洁且有用的结果。\n\n" +
            (memCtx ? memCtx + "\n\n" : "") +
            "当前时间：" + new Date().toLocaleString("zh-CN"),
        },
        { role: "user", content: prompt },
      ];

      let finalResult = "";
      let iterations = 0;
      let totalTokens = 0;

      const backgroundTools = [
        {
          type: "function",
          function: {
            name: "add_memory",
            description: "Save an important piece of information to your long-term memory for future use.",
            parameters: {
              type: "object",
              properties: {
                content: { type: "string", description: "The content to remember." },
                tags: { type: "array", items: { type: "string" }, description: "Array of topic tags." }
              },
              required: ["content"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "schedule_cron_job",
            description: "Schedule a future background task for yourself.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Name of the task." },
                schedule: { type: "string", description: "When to run, e.g. 'every 2h', 'daily'." },
                prompt: { type: "string", description: "The instructions for the background task." }
              },
              required: ["name", "schedule", "prompt"]
            }
          }
        }
      ];

      while (iterations < 5) {
        const response = await llmInvoke(messages, { temperature: 0.5, tools: backgroundTools });
        if (response.content) {
          finalResult += (finalResult ? "\n" : "") + response.content;
        }
        totalTokens += response.usage?.total_tokens ?? 0;

        if (response.tool_calls && response.tool_calls.length > 0) {
          for (const tc of response.tool_calls) {
            let toolOutput = "";
            try {
              const args = JSON.parse(tc.function.arguments);
              if (tc.function.name === "add_memory") {
                memoryStore.add(args.content, { source: "cron_tool", importance: 2, tags: args.tags || [] });
                toolOutput = "Memory saved successfully.";
                console.log(`[AgentRuntime] Tool call: add_memory (${args.content})`);
              } else if (tc.function.name === "schedule_cron_job") {
                db.prepare(`
                  INSERT INTO cron_jobs (name, schedule, prompt, enabled, next_run)
                  VALUES (?, ?, ?, 1, ?)
                `).run(args.name, args.schedule, args.prompt, computeNextRun(args.schedule));
                toolOutput = `Cron job '${args.name}' scheduled.`;
                console.log(`[AgentRuntime] Tool call: schedule_cron_job (${args.name})`);
              }
            } catch (e) {
              toolOutput = "Error executing tool: " + String(e);
            }
            messages.push({ role: "system", content: `Tool ${tc.function?.name} result: ${toolOutput}` });
          }
          iterations++;
        } else {
          break;
        }
      }

      db.prepare(`
        UPDATE task_runs SET status='done', result=?, finished_at=datetime('now'), tokens_used=?
        WHERE id=?
      `).run(finalResult, totalTokens, runId);

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
      db.prepare(`
        UPDATE task_runs SET status='failed', result=?, finished_at=datetime('now') WHERE id=?
      `).run(msg, runId);

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
    const jobs = db.prepare(`
      SELECT * FROM cron_jobs WHERE enabled=1
    `).all() as CronJobRow[];

    for (const job of jobs) {
      if (!isDue(job)) continue;

      // Update next_run immediately so concurrent ticks don't double-fire
      db.prepare(`
        UPDATE cron_jobs SET next_run=?, last_run=datetime('now'), run_count=run_count+1 WHERE id=?
      `).run(computeNextRun(job.schedule), job.id);

      // Run async without blocking the tick
      this.runTask(job.prompt, { jobId: job.id, trigger: "cron" }).catch((err) => {
        console.error(`[AgentRuntime] cron job ${job.id} failed:`, err);
      });
    }
  }

  status() {
    const db = getDb();
    const jobCount = (db.prepare("SELECT COUNT(*) as c FROM cron_jobs WHERE enabled=1").get() as { c: number }).c;
    const runningTasks = (db.prepare("SELECT COUNT(*) as c FROM task_runs WHERE status='running'").get() as { c: number }).c;
    const recentRuns = db.prepare(
      "SELECT * FROM task_runs ORDER BY started_at DESC LIMIT 10"
    ).all();
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
export const agentRuntime = new AgentRuntime();
