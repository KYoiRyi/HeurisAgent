import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { Agent } from "@/llm/pi-agent/agent";
import type { AgentEvent as PiAgentEvent } from "@/llm/pi-agent/types";
import type { AssistantMessage } from "@/llm/pi-ai/index";
import { DB } from "@/persistence/persistence.module";
import type { Database } from "@/persistence/database";
import { cronJobs, taskRuns, type CronJob } from "@/persistence/schema";
import { MemoryService } from "@/modules/memory/memory.service";
import { SettingsService } from "@/modules/settings/settings.service";
import { AgentEventBus } from "./event-bus";
import { buildHeurisTools, computeNextRun } from "./heuris-tools";

@Injectable()
export class AgentRuntimeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AgentRuntimeService.name);
  private readonly POLL_INTERVAL_MS = 30_000;
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: AgentEventBus,
    private readonly memory: MemoryService,
    private readonly settings: SettingsService,
  ) {}

  onApplicationBootstrap(): void {
    this.start();
  }

  onApplicationShutdown(): void {
    this.stop();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.POLL_INTERVAL_MS);
    this.events.emit({
      type: "status",
      payload: { running: true, message: "HeurisAgent runtime started" },
      ts: new Date().toISOString(),
    });
    this.logger.log("agent runtime started");
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.events.emit({
      type: "status",
      payload: { running: false, message: "HeurisAgent runtime stopped" },
      ts: new Date().toISOString(),
    });
    this.logger.log("agent runtime stopped");
  }

  async runTask(prompt: string, opts: { jobId?: number; trigger?: string } = {}): Promise<string> {
    const [run] = await this.db
      .insert(taskRuns)
      .values({
        jobId: opts.jobId ?? null,
        trigger: opts.trigger ?? "manual",
        prompt,
        status: "running",
      })
      .returning({ id: taskRuns.id });
    const runId = run.id;

    this.events.emit({
      type: "task_start",
      payload: { runId, prompt: prompt.substring(0, 120) },
      ts: new Date().toISOString(),
    });

    try {
      const memCtx = await this.memory.buildContextFromQueries([prompt], 12);
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

      const model = this.settings.getActiveModel();
      const apiKey = this.settings.getActiveApiKey();
      const agent = new Agent({
        initialState: {
          systemPrompt,
          model,
          tools: buildHeurisTools({ memory: this.memory, db: this.db, computeNextRun }),
        },
        getApiKey: () => apiKey,
        toolExecution: "parallel",
      });

      let finalResult = "";
      let totalTokens = 0;

      agent.subscribe((event: PiAgentEvent) => {
        if (event.type === "tool_execution_start") {
          this.events.emit({
            type: "tool_start",
            payload: { runId, toolName: event.toolName, args: event.args },
            ts: new Date().toISOString(),
          });
        } else if (event.type === "tool_execution_end") {
          this.events.emit({
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
            if (text) finalResult += (finalResult ? "\n" : "") + text;
            totalTokens += msg.usage?.totalTokens ?? 0;
          }
        }
      });

      await agent.prompt(prompt);

      await this.db
        .update(taskRuns)
        .set({
          status: "done",
          result: finalResult,
          tokensUsed: totalTokens,
          finishedAt: new Date(),
        })
        .where(eq(taskRuns.id, runId));

      await this.memory.syncTurn(prompt, finalResult, undefined, {
        source: opts.trigger === "cron" ? "cron" : "agent_tool",
      });

      if (finalResult.length > 50) {
        await this.memory.add(
          `[任务结果] ${prompt.substring(0, 60)}…\n${finalResult.substring(0, 300)}`,
          { source: "cron", importance: 1, tags: ["task-result"] },
        );
      }

      this.events.emit({
        type: "task_done",
        payload: { runId, result: finalResult.substring(0, 500) },
        ts: new Date().toISOString(),
      });

      return finalResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.db
        .update(taskRuns)
        .set({ status: "failed", result: message, finishedAt: new Date() })
        .where(eq(taskRuns.id, runId));
      this.events.emit({
        type: "task_error",
        payload: { runId, error: message },
        ts: new Date().toISOString(),
      });
      throw err;
    }
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    let jobs: CronJob[] = [];
    try {
      jobs = await this.db.select().from(cronJobs).where(eq(cronJobs.enabled, true));
    } catch (err) {
      this.logger.warn(`tick: failed to load cron jobs: ${String(err)}`);
      return;
    }

    const now = new Date();
    for (const job of jobs) {
      const next = job.nextRun ? new Date(job.nextRun) : null;
      if (next && next > now) continue;

      try {
        await this.db
          .update(cronJobs)
          .set({
            nextRun: computeNextRun(job.schedule),
            lastRun: now,
            runCount: (job.runCount ?? 0) + 1,
          })
          .where(eq(cronJobs.id, job.id));

        this.runTask(job.prompt, { jobId: job.id, trigger: "cron" }).catch((err) => {
          this.logger.error(`cron job ${job.id} failed: ${String(err)}`);
        });
      } catch (err) {
        this.logger.warn(`tick: failed to schedule job ${job.id}: ${String(err)}`);
      }
    }
  }

  async status() {
    const [{ jobCount }] = await this.db
      .select({ jobCount: sql<number>`count(*)::int` })
      .from(cronJobs)
      .where(eq(cronJobs.enabled, true));

    const [{ runningTasks }] = await this.db
      .select({ runningTasks: sql<number>`count(*)::int` })
      .from(taskRuns)
      .where(eq(taskRuns.status, "running"));

    const recentRuns = await this.db
      .select()
      .from(taskRuns)
      .orderBy(desc(taskRuns.startedAt))
      .limit(10);

    return {
      running: this.running,
      jobCount: jobCount ?? 0,
      runningTasks: runningTasks ?? 0,
      memoryCount: await this.memory.count(),
      recentRuns,
    };
  }

  async listCronJobs(): Promise<CronJob[]> {
    return this.db.select().from(cronJobs).orderBy(desc(cronJobs.createdAt));
  }

  async createCronJob(input: {
    name: string;
    schedule: string;
    prompt: string;
    enabled?: boolean;
  }): Promise<CronJob> {
    const [row] = await this.db
      .insert(cronJobs)
      .values({
        name: input.name,
        schedule: input.schedule,
        prompt: input.prompt,
        enabled: input.enabled ?? true,
        nextRun: computeNextRun(input.schedule),
      })
      .returning();
    return row;
  }

  async toggleCronJob(id: number, enabled: boolean): Promise<CronJob | null> {
    const [row] = await this.db
      .update(cronJobs)
      .set({ enabled })
      .where(eq(cronJobs.id, id))
      .returning();
    return row ?? null;
  }

  async deleteCronJob(id: number): Promise<boolean> {
    const rows = await this.db
      .delete(cronJobs)
      .where(eq(cronJobs.id, id))
      .returning({ id: cronJobs.id });
    return rows.length > 0;
  }

  async listTaskRuns(limit = 50) {
    return this.db.select().from(taskRuns).orderBy(desc(taskRuns.startedAt)).limit(limit);
  }
}
