import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Agent } from "@/llm/pi-agent/agent";
import type { AgentEvent as PiAgentEvent } from "@/llm/pi-agent/types";
import type { AssistantMessage } from "@/llm/pi-ai/index";
import { DB } from "@/persistence/persistence.module";
import type { Database } from "@/persistence/database";
import { taskRuns } from "@/persistence/schema";
import { MemoryService } from "@/modules/memory/memory.service";
import { ResourcesService } from "@/modules/resources/resources.service";
import { ErrorsService } from "@/modules/errors/errors.service";
import { SettingsService } from "@/modules/settings/settings.service";
import { ClassroomHistoryService } from "@/modules/classroom-history/classroom-history.service";
import { ClassroomSessionsService } from "@/modules/classroom-history/classroom-sessions.service";
import { AgentEventBus } from "@/runtime/event-bus";
import { buildClassroomTools } from "@/runtime/classroom-tools";
import { LearningRecordsService } from "@/modules/learning-records/learning-records.service";

export interface ClassroomTurnInput {
  prompt: string;
  subject?: string;
  studentName?: string;
  sessionId?: string;
  stageEvents?: Array<{ type: string; payload?: unknown; description?: string }>;
  activeStage?: { description: string } | null;
}

export interface ClassroomTurnResult {
  result: string;
  liveComponents: Array<{ html: string; css?: string; js?: string; description: string; stageType?: string }>;
  toolCalls: Array<{ name: string; args: unknown; isError?: boolean }>;
  resources: Array<{ id: string; title: string; category: string }>;
  errors: Array<{ id: string; questionText: string; errorType: string | null }>;
  memorySaved: number;
  knowledgePoints: string[];
  scoreFeedback: { score: number; total: number; feedback: string; correct?: boolean } | null;
}

@Injectable()
export class ClassroomService {
  private readonly logger = new Logger(ClassroomService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: AgentEventBus,
    private readonly memory: MemoryService,
    private readonly resources: ResourcesService,
    private readonly errors: ErrorsService,
    private readonly settings: SettingsService,
    private readonly history: ClassroomHistoryService,
    private readonly sessions: ClassroomSessionsService,
    private readonly learningRecords: LearningRecordsService,
  ) {}

  async runTurn(input: ClassroomTurnInput): Promise<ClassroomTurnResult> {
    const subject = input.subject?.trim() || "通用";
    const studentName = input.studentName?.trim();
    const sessionId = input.sessionId?.trim()
      ? await this.sessions.ensureSession(input.sessionId.trim(), subject)
      : undefined;

    const [run] = await this.db
      .insert(taskRuns)
      .values({
        trigger: "classroom",
        prompt: input.prompt,
        status: "running",
      })
      .returning({ id: taskRuns.id });
    const runId = run.id;

    this.events.emit({
      type: "task_start",
      payload: { runId, prompt: input.prompt.substring(0, 120), source: "classroom" },
      ts: new Date().toISOString(),
    });

    await this.history.add({
      sessionId,
      subject,
      role: "student",
      content: input.prompt,
    });

    if (sessionId) {
      this.sessions.updateTitle(sessionId, input.prompt.slice(0, 60) || `${subject} 课堂`).catch(() => {});
    }

    try {
      const memCtx = await this.memory.buildContextFromQueries(
        [input.prompt, subject],
        12,
        subject,
      );
      const historyCtx = await this.history.buildContext(subject, 16);

      const stageEventsBlock = formatStageEvents(input.stageEvents);
      const activeStageBlock = input.activeStage?.description
        ? `<active-stage>\n[当前正在展示的互动黑板：${input.activeStage.description}]\n</active-stage>`
        : "";

      const systemPrompt =
        [
          "你是 HeurisAgent 课堂互动智能体，运行在 pi-agent 内核上。",
          "教学风格：先用启发式提问引导思考，再用 render_live_component 生成可交互的黑板组件来巩固。",
          "黑板组件 (render_live_component) 要求：",
          "  • 必须是一段自包含、可在 iframe sandbox 内运行的 HTML/CSS/JS。",
          "  • 在 JS 里调用 window.HeurisStage.emit(type, payload) 报告学生交互（answer / progress / measurement / misconception）。",
          "  • 不要使用外部 CDN 资源，所有逻辑用 vanilla JS。",
          "  • description 字段写成简短的中文标题。",
          "  • stageType 字段（可选但推荐）：quiz（选择/填空题）、simulation（物理/化学模拟）、graph（图表/函数图像）、lab（虚拟实验）、exercise（综合练习）。",
          "  • quiz 类型：答题后调用 HeurisStage.answer({ answer, correct, score, total })。",
          "  • simulation/lab 类型：关键步骤调用 HeurisStage.progress({ step, total })。",
          "其他工具：",
          "  • save_learning_resource：遇到新的知识点 / 定律 / 公式 / 例题，主动保存。",
          "  • save_error_question：遇到学生答错或概念误解，主动记录。",
          "  • add_memory：保存学生画像（姓名、年级、偏好、目标、长期记忆点）。",
          "  • search_memory：在需要回忆学生过往时调用。",
          "工具调用可以并行；调用结束后给出简洁明了的最终回答（≤300字），不要复述工具结果。",
          "禁止：使用 <think>/<thinking>/<reasoning> 等推理标签输出最终回复。任何思考过程必须留在工具调用之外、不要写入用户可见文本。",
          studentName ? `当前学生：${studentName}` : "",
          `当前学科：${subject}`,
        ]
          .filter(Boolean)
          .join("\n") +
        "\n\n" +
        (historyCtx ? historyCtx + "\n\n" : "") +
        (memCtx ? memCtx + "\n\n" : "") +
        (activeStageBlock ? activeStageBlock + "\n\n" : "") +
        (stageEventsBlock ? stageEventsBlock + "\n\n" : "") +
        "当前时间：" +
        new Date().toLocaleString("zh-CN");

      const model = this.settings.getActiveModel();
      const apiKey = this.settings.getActiveApiKey();
      const agent = new Agent({
        initialState: {
          systemPrompt,
          model,
          tools: buildClassroomTools({
            memory: this.memory,
            resources: this.resources,
            errors: this.errors,
            db: this.db,
            studentName,
            sessionId,
            subject,
          }),
        },
        getApiKey: () => apiKey,
        toolExecution: "parallel",
      });

      let finalResult = "";
      let totalTokens = 0;
      const liveComponents: ClassroomTurnResult["liveComponents"] = [];
      const toolCalls: ClassroomTurnResult["toolCalls"] = [];
      const savedResources: ClassroomTurnResult["resources"] = [];
      const savedErrors: ClassroomTurnResult["errors"] = [];
      const knowledgePoints = new Set<string>();
      let memorySaved = 0;
      let scoreFeedback: ClassroomTurnResult["scoreFeedback"] = null;

      agent.subscribe((event: PiAgentEvent) => {
        if (event.type === "tool_execution_start") {
          this.events.emit({
            type: "tool_start",
            payload: { runId, toolName: event.toolName, args: event.args, source: "classroom" },
            ts: new Date().toISOString(),
          });
          if (event.toolName === "render_live_component") {
            const args = event.args as { html?: string; css?: string; js?: string; description?: string; stageType?: string };
            if (args?.html) {
              liveComponents.push({
                html: args.html,
                css: args.css,
                js: args.js,
                description: args.description ?? "",
                stageType: args.stageType,
              });
            }
          }
          toolCalls.push({ name: event.toolName, args: event.args });
        } else if (event.type === "tool_execution_end") {
          this.events.emit({
            type: "tool_end",
            payload: { runId, toolName: event.toolName, isError: event.isError, source: "classroom" },
            ts: new Date().toISOString(),
          });
          const last = [...toolCalls].reverse().find((t) => t.name === event.toolName);
          if (last) last.isError = event.isError;

          const details = (event.result?.details ?? {}) as Record<string, unknown>;
          if (event.toolName === "save_learning_resource" && details.saved) {
            const id = typeof details.id === "string" ? details.id : "";
            const title = typeof details.title === "string" ? details.title : "";
            const category = typeof details.category === "string" ? details.category : "knowledge-point";
            if (id && title) {
              savedResources.push({ id, title, category });
              if (category === "knowledge-point") knowledgePoints.add(title);
            }
          } else if (event.toolName === "save_error_question" && details.saved) {
            const id = typeof details.id === "string" ? details.id : "";
            const questionText = typeof details.question_text === "string" ? details.question_text : "";
            const errorType =
              typeof details.error_type === "string" ? details.error_type : null;
            if (id && questionText) {
              savedErrors.push({ id, questionText, errorType });
            }
          } else if (event.toolName === "add_memory" && details.saved) {
            memorySaved += 1;
          }
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

      await agent.prompt(input.prompt);

      const cleanedResult = sanitizeAgentReply(finalResult);

      await this.db
        .update(taskRuns)
        .set({
          status: "done",
          result: cleanedResult,
          tokensUsed: totalTokens,
          finishedAt: new Date(),
        })
        .where(eq(taskRuns.id, runId));

      const lastComponent = liveComponents[liveComponents.length - 1] ?? null;

      // Extract score feedback from stage events
      if (input.stageEvents) {
        const answerEvents = input.stageEvents.filter((e) => e.type === "answer");
        const lastAnswer = answerEvents[answerEvents.length - 1];
        if (lastAnswer?.payload && typeof lastAnswer.payload === "object") {
          const p = lastAnswer.payload as Record<string, unknown>;
          if (typeof p.score === "number" && typeof p.total === "number") {
            scoreFeedback = {
              score: p.score,
              total: p.total,
              feedback: typeof p.feedback === "string" ? p.feedback : "",
              correct: typeof p.correct === "boolean" ? p.correct : undefined,
            };
          }
        }
      }

      await this.history.add({
        sessionId,
        subject,
        role: "agent",
        content: cleanedResult,
        knowledgePoints: Array.from(knowledgePoints),
        liveComponent: lastComponent
          ? {
              html: lastComponent.html,
              css: lastComponent.css ?? "",
              js: lastComponent.js ?? "",
              description: lastComponent.description,
            }
          : null,
        liveComponents: liveComponents.map((c) => ({
          html: c.html,
          css: c.css ?? "",
          js: c.js ?? "",
          description: c.description,
          stageType: c.stageType,
        })),
        stageType: lastComponent?.stageType ?? null,
        toolCalls: toolCalls.map((t) => ({ name: t.name, isError: t.isError ?? false })),
      });

      await this.memory.syncTurn(input.prompt, cleanedResult, sessionId, {
        studentName,
        subject,
        source: "classroom",
      });

      if (scoreFeedback && studentName) {
        await this.learningRecords.recordScore({
          studentName,
          subject,
          score: scoreFeedback.score,
          stageType: lastComponent?.stageType,
          sessionId,
        }).catch(() => {});
      }

      this.events.emit({
        type: "task_done",
        payload: { runId, result: cleanedResult.substring(0, 500), source: "classroom" },
        ts: new Date().toISOString(),
      });

      return {
        result: cleanedResult,
        liveComponents,
        toolCalls,
        resources: savedResources,
        errors: savedErrors,
        memorySaved,
        knowledgePoints: Array.from(knowledgePoints),
        scoreFeedback,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.db
        .update(taskRuns)
        .set({ status: "failed", result: message, finishedAt: new Date() })
        .where(eq(taskRuns.id, runId));
      this.events.emit({
        type: "task_error",
        payload: { runId, error: message, source: "classroom" },
        ts: new Date().toISOString(),
      });
      this.logger.error(`classroom turn failed: ${message}`);
      throw err;
    }
  }
}

function sanitizeAgentReply(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/<\/think>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatStageEvents(
  events: Array<{ type: string; payload?: unknown; description?: string }> | undefined,
): string {
  if (!events || events.length === 0) return "";
  const lines = events.slice(-10).map((e) => {
    const head = e.description ? `[${e.description}] ${e.type}` : e.type;
    const tail = e.payload === undefined ? "" : ` :: ${truncate(stringifyPayload(e.payload), 160)}`;
    return `• ${head}${tail}`;
  });
  return [
    "<stage-events>",
    "[System note: 学生在上一轮黑板组件中触发的交互事件，作为本轮回答的依据]",
    ...lines,
    "</stage-events>",
  ].join("\n");
}

function stringifyPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "number" || typeof payload === "boolean") return String(payload);
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}
