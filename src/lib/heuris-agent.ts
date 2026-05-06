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
import { resourceStore } from "./resources";
import { getSupabaseClient } from "@/storage/database/supabase-client";

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

export function buildHeurisTools(): AgentTool[] {
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

const RenderLiveComponentSchema = Type.Object({
  html: Type.String({ description: "The HTML structure of the interactive component" }),
  css: Type.Optional(Type.String({ description: "Any custom CSS styles (vanilla CSS)" })),
  js: Type.Optional(Type.String({ description: "Vanilla JavaScript to make the component interactive" })),
  description: Type.String({ description: "A brief description of what this component is" }),
});

interface ClassroomToolContext {
  studentName?: string;
  sessionId?: string;
  subject?: string;
}

export function buildClassroomTools(context: ClassroomToolContext = {}): AgentTool[] {
  const addMemoryTool: AgentTool<typeof AddMemorySchema> = {
    name: "add_memory",
    label: "Add Memory",
    description: "Save important long-term facts or context.",
    parameters: AddMemorySchema,
    execute: async (_id, params: Static<typeof AddMemorySchema>) => {
      const studentPrefix = context.studentName ? `学生${context.studentName}：` : "";
      const savedContent = `${studentPrefix}${params.content}`;
      memoryStore.add(savedContent, {
        source: "classroom",
        importance: 2,
        session_id: context.sessionId,
        tags: [
          ...(params.tags ?? []),
          ...(context.studentName ? [`student:${context.studentName}`] : []),
          ...(context.subject ? [`subject:${context.subject}`] : []),
        ],
      });
      console.log(`[Classroom] add_memory: ${savedContent.substring(0, 80)}`);
      return {
        content: [{ type: "text", text: "Memory saved successfully." }],
        details: { saved: true, content: savedContent },
      };
    },
  };

  const renderLiveComponent: AgentTool<typeof RenderLiveComponentSchema> = {
    name: "render_live_component",
    label: "Render Live Component",
    description: "Generate a live interactive UI component (HTML/CSS/vanilla JS) to render on the Stage. Use it for simulations, quizzes, graphs, labs, and widgets. JS should call window.HeurisStage.emit(type, payload) for student answers, progress, scores, measurements, and misconceptions so future turns can read the results.",
    parameters: RenderLiveComponentSchema,
    execute: async (_id, params: Static<typeof RenderLiveComponentSchema>) => {
      // The actual rendering happens on the frontend via the SSE event stream parsing the tool call.
      // This execute function just acknowledges to the Agent that the component was successfully sent to the student.
      console.log(`[Classroom] Rendered component: ${params.description}`);
      return {
        content: [{ type: "text", text: "Component has been rendered successfully on the student's interactive stage." }],
        details: params,
      };
    },
  };
  
  // The classroom agent can also search memory if needed.
  // We extract searchMemoryTool from buildHeurisTools so we can reuse it.
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

  // 1. Tool: save_learning_resource
  const SaveResourceSchema = Type.Object({
    title: Type.String(),
    content: Type.String({ description: "Markdown structured content for the resource (PPT/Note)." }),
    subject: Type.String(),
    tags: Type.Array(Type.String()),
  });

  const saveResourceTool: AgentTool<typeof SaveResourceSchema> = {
    name: "save_learning_resource",
    label: "Save Learning Resource",
    description: "Save a structured knowledge-point resource to the class database. Only use it for concrete knowledge points, formulas, laws, concepts, methods, examples, or Stage experiment conclusions. Do not save ordinary chat transcripts or vague summaries.",
    parameters: SaveResourceSchema,
    execute: async (_id, params: Static<typeof SaveResourceSchema>) => {
      if (!isKnowledgeResource(params)) {
        return {
          content: [{ type: "text", text: "Skipped resource save: no concrete knowledge point was found." }],
          details: { saved: false, skipped: true, reason: "missing_knowledge_point", title: params.title },
        };
      }
      const client = getSupabaseClient();
      if (!client) {
        const resource = resourceStore.add({
          title: params.title,
          content: params.content,
          subject: params.subject,
          category: "knowledge-point",
          tags: ["knowledge-point", ...params.tags],
          created_by: "classroom_agent",
        });
        return {
          content: [{ type: "text", text: `Saved learning resource locally: ${params.title}` }],
          details: { ...resource, saved: true },
        };
      }
      try {
        const { data, error } = await client.from("learning_resources").insert({
          title: params.title,
          content: params.content,
          subject: params.subject,
          category: "knowledge-point",
          tags: ["knowledge-point", ...params.tags],
          created_by: "classroom_agent",
        }).select();
        if (error) throw new Error(error.message);
        console.log(`[Classroom] Saved resource: ${params.title}`);
        return {
          content: [{ type: "text", text: `Successfully saved learning resource: ${params.title}` }],
          details: { ...(data?.[0] ?? params), saved: true },
        };
      } catch (err) {
        const resource = resourceStore.add({
          title: params.title,
          content: params.content,
          subject: params.subject,
          category: "knowledge-point",
          tags: ["knowledge-point", ...params.tags],
          created_by: "classroom_agent",
        });
        return {
          content: [{ type: "text", text: `Saved learning resource locally after database error: ${params.title}` }],
          details: { ...resource, saved: true, warning: String(err) },
        };
      }
    },
  };

  // 2. Tool: save_error_question
  const SaveErrorSchema = Type.Object({
    student_name: Type.String(),
    subject: Type.String(),
    question_text: Type.String(),
    student_answer: Type.Optional(Type.String()),
    error_type: Type.String({ description: "Category of error: concept, calculation, careless, method" }),
    error_analysis: Type.String(),
  });

  const saveErrorTool: AgentTool<typeof SaveErrorSchema> = {
    name: "save_error_question",
    label: "Save Error Question",
    description: "Proactively record a student's mistake or misunderstanding to their error database for future review.",
    parameters: SaveErrorSchema,
    execute: async (_id, params: Static<typeof SaveErrorSchema>) => {
      const client = getSupabaseClient();
      if (!client) {
        const memory = saveErrorQuestionMemory(params, context.sessionId);
        return {
          content: [{ type: "text", text: "Saved error record to local memory fallback." }],
          details: { saved: true, local: true, memoryId: memory.id, ...params },
        };
      }
      try {
        await client.from("error_questions").insert({
          student_name: params.student_name,
          subject: params.subject,
          question_text: params.question_text,
          student_answer: params.student_answer,
          error_type: params.error_type,
          error_analysis: params.error_analysis,
          status: "pending",
        });
        console.log(`[Classroom] Logged error for ${params.student_name}`);
        return {
          content: [{ type: "text", text: `Successfully logged error record for ${params.student_name}` }],
          details: { saved: true, ...params },
        };
      } catch (err) {
        const memory = saveErrorQuestionMemory(params, context.sessionId);
        return {
          content: [{ type: "text", text: `Saved error to local memory after database error: ${String(err)}` }],
          details: { saved: true, local: true, memoryId: memory.id, warning: String(err), ...params },
        };
      }
    },
  };

  // 3. We also expose addMemoryTool to classroom agent
  return [renderLiveComponent, searchMemoryTool, addMemoryTool, saveResourceTool, saveErrorTool];
}

function isKnowledgeResource(params: { title: string; content: string; tags: string[] }): boolean {
  const combined = `${params.title}\n${params.content}\n${params.tags.join(" ")}`;
  return /知识点|概念|定律|公式|原理|规则|方法|模型|例题|实验|结论|误区|错因|法则|单位|性质|推导|knowledge|concept|formula|law|principle/i.test(combined);
}

function saveErrorQuestionMemory(
  params: {
    student_name: string;
    subject: string;
    question_text: string;
    student_answer?: string;
    error_type: string;
    error_analysis: string;
  },
  sessionId?: string
) {
  return memoryStore.add(
    [
      "[错题记录]",
      `学生：${params.student_name}`,
      `学科：${params.subject}`,
      `题目：${params.question_text}`,
      params.student_answer ? `学生答案：${params.student_answer}` : "",
      `错误类型：${params.error_type}`,
      `错因分析：${params.error_analysis}`,
    ]
      .filter(Boolean)
      .join("\n"),
    {
      source: "error",
      importance: 3,
      session_id: sessionId,
      tags: ["error-question", "weakness", `subject:${params.subject}`, `student:${params.student_name}`],
    }
  );
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
      const memCtx = memoryStore.buildContextFromQueries([prompt], 12);
      const systemPrompt =
        [
          "你是 HeurisAgent 后台任务执行智能体，运行在 pi-agent 内核上。",
          "你不是被动聊天补全，而是有工具、有记忆、有任务循环的自主代理。",
          "请先判断是否需要 search_memory、add_memory 或 schedule_cron_job；满足条件就主动调用工具。",
          "工具调用可以并行执行；工具返回后继续综合结果，给出简洁且有用的最终结果。",
          "不要把完整原始对话保存为记忆，只保存 durable facts、偏好、目标、任务结论或可复用知识。",
        ].join("\n") +
        "\n\n" +
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

      memoryStore.syncTurn(prompt, finalResult, undefined, {
        source: opts.trigger === "cron" ? "cron" : "agent_tool",
      });

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
