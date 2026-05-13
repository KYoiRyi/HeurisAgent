import { NextRequest, NextResponse } from "next/server";
import { getActiveModel, getActiveApiKey } from "@/lib/model-config";
import { Agent } from "@/lib/pi-agent/agent";
import type { AgentEvent as PiAgentEvent, AgentMessage } from "@/lib/pi-agent/types";
import { buildClassroomTools } from "@/lib/heuris-agent";
import { loadSkills, formatSkillsForPrompt } from "@/lib/pi-agent/skills";
import type { AssistantMessage } from "@/lib/pi-ai/index";
import path from "path";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { sessionManager } from "@/lib/pi-agent/session-manager";
import { memoryStore } from "@/lib/memory";
import { resourceStore } from "@/lib/resources";
import { classroomHistoryStore } from "@/lib/classroom-history";

const CLASSROOM_SYSTEM_PROMPT = `你是一个专业的课堂互动智能体（HeurisAgent），擅长实时提问解答、知识点联动讲解和出题测验。

# ══════════════════════════════════════════════
# 🚨 最高优先级强制规则 — 每轮必须执行，违反即为错误
# ══════════════════════════════════════════════

## 强制规则 A：每轮教学必须调用黑板或出题工具（二选一或全选）

每次回复中，**只要不是 [EXERCISE_SUBMISSION] 答题批改**，你必须至少执行以下操作之一：

- **操作①（出题）**：调用 save_learning_resource(category='exercise') 保存一道新题目。即使学生没有要求，你也应主动出题检验理解。
- **操作②（黑板）**：调用 render_live_component 生成一个与当前讲解内容相关的可交互演示（公式推导动画、实验模拟、概念图、数据图表等）。

> ❌ 禁止只输出文字回答而不调用任何工具。纯文字回答 = 教学失职。
> ✅ 推荐每轮同时调用两个工具：先出一道题，再渲染一个演示。


## 强制规则 B：出题必须按模板格式，保存为 exercise

> ⚠️ **每次 save_learning_resource(exercise) 调用只允许出一道题。**
> 严禁在单次调用中塞入多道题（禁止"第1题...第2题...第3题..."这种格式）。
> 如需出多题，请分开多次调用，每次只出一道，每道题独立保存为一个资源。

调用 save_learning_resource 出题时，content 按以下模板之一写（Markdown），**每次只写一道题的内容**：

**选择题：**
\`\`\`
## [一道题的完整题干]

A. [选项A]
B. [选项B]
C. [选项C]
D. [选项D]

**题型：** 单选题  **难度：** [简单/中等/困难]  **知识点：** [涉及知识点]
\`\`\`

**填空题：**
\`\`\`
## [一道题的完整题干]

答案：______

**题型：** 填空题  **难度：** [简单/中等/困难]  **知识点：** [涉及知识点]
\`\`\`

**计算/简答题：**
\`\`\`
## [一道题的完整题干]

**题型：** [计算题/简答题/证明题]  **难度：** [简单/中等/困难]  **知识点：** [涉及知识点]

> 提示：请在下方答题区填写完整解题过程
\`\`\`

## 强制规则 C：收到 [EXERCISE_SUBMISSION] 时批改并分支处理

学生消息含 [EXERCISE_SUBMISSION] 时，执行下列全部步骤，不得省略：
1. 给出完整批改反馈（正确/错误分析）和正确答案详细解析
2. **仅当学生答案有误或部分错误时**，才调用 save_error_question（error_type 使用 concept/calculation/careless/method，**禁止使用 correct**）
3. 如答案正确，不调用 save_error_question，改为调用 add_memory 记录"已掌握"的知识点
4. 如发现薄弱点，额外调用 add_memory
5. 告知学生批改结果，并出一道同类新题（调用 save_learning_resource exercise）

## 强制规则 D：工具边界（严格区分）
| 内容类型 | 使用工具 |
|---------|--------|
| 可交互图表、物理实验、动画、数学可视化 | render_live_component |
| 纯文字题目（选择/填空/简答/计算） | save_learning_resource(exercise) |
| 知识点卡片、公式总结、概念梳理 | save_learning_resource(knowledge-point) |
| 学生错误/薄弱点 | save_error_question |
| 重要学习进度/个性化偏好 | add_memory |

- render_live_component 的 JS 必须调用 window.HeurisStage.emit(type, payload) 上报学生交互结果
- **黑板渲染规范**：系统已在外部提供了居中和滚动容器，你输出的 HTML/CSS **严禁使用** \`position: fixed\`、\`position: absolute\` 定位到屏幕边缘，严禁使用 \`width: 100vw\` 或 \`height: 100vh\`。请直接输出内部组件结构，让其自然撑开即可完美居中。
- 同一回复可同时调用多个工具，并行执行

# ══════════════════════════════════════════════
# 回答与教学风格要求
# ══════════════════════════════════════════════

- 先给出清晰的文字讲解，然后调用工具（工具调用在文字后执行）
- 语言简洁易懂，适合课堂场景，用类比帮助理解
- 引导学生主动思考，不要直接给出所有答案
- 计算题给出分步骤解题过程
- 鼓励探究精神，对学生的好奇心给予正向反馈`;

interface ClassroomRequestBody {
  message?: unknown;
  sessionId?: unknown;
  subject?: unknown;
  studentName?: unknown;
  stageEvents?: unknown;
  activeStage?: unknown;
}

interface StageEventContext {
  type: string;
  payload: unknown;
  ts?: string;
  description?: string;
}

interface ActiveStageContext {
  description?: string;
}

interface ToolCallSnapshot {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  args?: unknown;
  result?: unknown;
  startedAt: string;
  endedAt?: string;
}

interface ClassroomFallbackInput {
  message: string;
  subject: string;
  memoryContext: string;
  historyContext: string;
  resourceContext: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ClassroomRequestBody;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const subject = typeof body.subject === "string" ? body.subject : undefined;
    const studentName = typeof body.studentName === "string" ? body.studentName : undefined;
    const stageEvents = normalizeStageEvents(body.stageEvents);
    const activeStage = normalizeActiveStage(body.activeStage);
    const stageContext = formatStageContext(stageEvents, activeStage);
    const legacySubject = typeof subject === "string" && subject.trim() ? subject.trim() : undefined;
    const legacyStudentName =
      typeof studentName === "string" && studentName.trim() ? studentName.trim() : undefined;

    if (!message) {
      return NextResponse.json({ error: "消息内容不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取会话上下文
    let sessionContext = "";
    let relatedPoints: string[] = [];
    if (client && sessionId) {
      const { data: session } = await client
        .from("classroom_sessions")
        .select("title, subject, topic_summary, key_points")
        .eq("id", sessionId)
        .maybeSingle();

      if (session) {
        sessionContext = `当前课堂：${session.title}，学科：${session.subject}`;
        if (session.topic_summary) {
          sessionContext += `，主题概要：${session.topic_summary}`;
        }
        if (session.key_points && Array.isArray(session.key_points)) {
          relatedPoints = session.key_points as string[];
        }
      }
    }

    // 获取相关教学资源，Supabase 不可用时回退到本地 SQLite 资源库
    let resourceContext = "";
    const resources = await loadClassroomResources(client, legacySubject);
    if (resources.length > 0) {
      resourceContext =
        "\n\n相关教学资源参考：\n" +
        resources
          .map(
            (r, i) =>
              `${i + 1}. ${r.title}${r.content ? `：${r.content.substring(0, 360)}` : ""}`
          )
          .join("\n");
    }

    const inferredResourceSubject = inferSubjectFromResources(resources);
    const recordSubject = legacySubject ?? inferredResourceSubject ?? "通用";
    const recordStudentName = legacyStudentName ?? "记忆学习者";
    const classroomHistoryContext = classroomHistoryStore.buildContext(recordSubject, 18);

    // Auto-inject memory context from the active turn plus previously saved talks.
    // Pass `recordSubject` so recall is scoped to the current subject first.
    const memoryContext = memoryStore.buildContextFromQueries(
      [
        message,
        legacyStudentName,
        legacySubject,
        inferredResourceSubject,
        "错题 误区 薄弱点 error-question weakness knowledge-point",
        ...stageEvents.map(formatStageEventForSearch),
      ],
      14,
      recordSubject
    );

    // Load agent skills
    const skillsDir = path.join(process.cwd(), "data", "skills");
    const loadedSkills = loadSkills(skillsDir);
    const skillsPrompt = formatSkillsForPrompt(loadedSkills);

    // Build pi-ai context
    const systemPrompt =
      CLASSROOM_SYSTEM_PROMPT +
      skillsPrompt +
      "\n\n" +
      (memoryContext ? memoryContext + "\n\n" : "") +
      (classroomHistoryContext ? classroomHistoryContext + "\n\n" : "") +
      (stageContext ? stageContext + "\n\n" : "") +
      `${sessionContext}${resourceContext}\n\n` +
      "不要依赖旧版的手动学科/学生姓名选择器；请优先从当前对话、课堂资料、技能说明和记忆上下文中推断学习者画像、主题和薄弱点。若确实缺少关键信息，再自然追问。\n\n" +
      [
        "【本轮强制执行检查清单】",
        "在生成最终回复之前，你必须先完成下列工具调用检查：",
        "",
        "□ 检查1：这条消息是否包含 [EXERCISE_SUBMISSION]？",
        "  → 是：必须调用 save_error_question + 出一道新题(save_learning_resource exercise)",
        "  → 否：继续检查2和3",
        "",
        "□ 检查2（必须执行）：调用 render_live_component 渲染一个与本轮讲解内容相关的互动演示。",
        "  可以是：知识点可视化、公式动画、物理模拟、图表、小游戏、互动测验界面等",
        "  不得以'内容不需要'为由跳过——总能找到一个有价值的可视化角度",
        "",
        "□ 检查3（必须执行）：调用 save_learning_resource(category='exercise') 出一道新题。",
        "  围绕本轮知识点出题，选择题/填空题/计算题均可，套用强制规则B的模板格式",
        "",
        "□ 检查4（条件执行）：如果讲解了新知识点，调用 save_learning_resource(knowledge-point) 保存知识卡片",
        "□ 检查5（条件执行）：如果发现学生有薄弱点，调用 add_memory 记录",
        "",
        "工具调用完成后，再输出最终的文字教学内容。",
        "可以并行调用多个工具以节省时间。",
        "不要把 JSON、工具调用代码块、或思考过程写在正文中。",
      ].join("\n");

    // Load agent history from stateful session manager
    const piMessages = sessionId ? sessionManager.load(sessionId) : [];

    const model = getActiveModel();
    const apiKey = getActiveApiKey();

    // Initialize the Agent
    const agent = new Agent({
      initialState: {
        systemPrompt,
        messages: piMessages,
        model,
        tools: buildClassroomTools({ studentName: legacyStudentName, sessionId, subject: legacySubject }),
      },
      getApiKey: () => apiKey,
      toolExecution: "parallel",
    });

    // SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = "";
        let finalAssistantText = "";
        let hiddenThinking = "";
        let liveComponent: Record<string, string> | null = null;
        let finalError: string | null = null;
        let emptyFollowUpQueued = false;
        const toolCalls = new Map<string, ToolCallSnapshot>();

        const sendEvent = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        const sendLog = (level: "info" | "warn" | "error", messageText: string, details?: unknown) => {
          sendEvent({
            log: {
              ts: new Date().toISOString(),
              level,
              message: messageText,
              details: safeToolPayload(details),
            },
          });
        };

        try {
          sendLog("info", "classroom request accepted", {
            subject: recordSubject,
            sessionId,
            messageLength: message.length,
            memoryContext: Boolean(memoryContext),
            classroomHistoryContext: Boolean(classroomHistoryContext),
            stageEventCount: stageEvents.length,
            resourceCount: resources.length,
          });

          agent.subscribe((event: PiAgentEvent) => {
            if (event.type === "agent_start") {
              sendLog("info", "pi-agent started", { model: model.name ?? model.provider });
            } else if (event.type === "turn_start") {
              sendLog("info", "agent turn started");
            } else if (event.type === "turn_end") {
              sendLog("info", "agent turn ended", {
                toolResultCount: event.toolResults.length,
              });
            } else if (event.type === "agent_end") {
              sendLog("info", "pi-agent ended", { messageCount: event.messages.length });
            }

            if (event.type === "message_update") {
              const chunk = event.assistantMessageEvent;
              if (chunk.type === "thinking_delta") {
                hiddenThinking += chunk.delta;
              } else if (chunk.type === "thinking_end") {
                hiddenThinking = stripThinkingBlocks(hiddenThinking);
              } else if (chunk.type === "text_delta") {
                fullContent += chunk.delta;
                sendEvent({ content: chunk.delta });
              } else if (chunk.type === "error") {
                sendEvent({ error: chunk.error.errorMessage ?? "LLM error" });
                finalError = chunk.error.errorMessage ?? "LLM error";
              }
            } else if (event.type === "tool_execution_start") {
              const toolCall = {
                id: event.toolCallId,
                name: event.toolName,
                status: "running" as const,
                args: safeToolPayload(event.args),
                startedAt: new Date().toISOString(),
              };
              toolCalls.set(event.toolCallId, toolCall);
              sendEvent({ toolCall: toolCallToEvent(toolCall) });
              sendLog("info", `tool started: ${event.toolName}`, toolCallToEvent(toolCall));

              if (event.toolName === "render_live_component") {
                liveComponent = event.args as Record<string, string>;
                sendEvent({ status: `正在渲染互动黑板组件: ${liveComponent.description || "加载中..."}` });
              } else if (event.toolName === "search_memory") {
                sendEvent({ status: "智能体正在检索记忆" });
              } else if (event.toolName === "add_memory") {
                sendEvent({ status: "智能体正在保存上下文记忆" });
              } else if (event.toolName === "save_learning_resource") {
                sendEvent({ status: "智能体正在生成课堂板书/资源" });
              } else if (event.toolName === "save_error_question") {
                sendEvent({ status: "智能体正在记录错题分析" });
              }
            } else if (event.type === "tool_execution_update") {
              const existing = toolCalls.get(event.toolCallId);
              const toolCall = {
                id: event.toolCallId,
                name: event.toolName,
                status: "running" as const,
                args: safeToolPayload(event.args),
                result: safeToolPayload(event.partialResult),
                startedAt: existing?.startedAt ?? new Date().toISOString(),
              };
              toolCalls.set(event.toolCallId, toolCall);
              sendEvent({ toolCall: toolCallToEvent(toolCall) });
              sendLog("info", `tool update: ${event.toolName}`, toolCallToEvent(toolCall));
            } else if (event.type === "tool_execution_end") {
              const existing = toolCalls.get(event.toolCallId);
              const toolCall = {
                id: event.toolCallId,
                name: event.toolName,
                status: event.isError ? "error" as const : "done" as const,
                args: existing?.args,
                result: safeToolPayload(event.result),
                startedAt: existing?.startedAt ?? new Date().toISOString(),
                endedAt: new Date().toISOString(),
              };
              toolCalls.set(event.toolCallId, toolCall);
              sendEvent({ toolCall: toolCallToEvent(toolCall) });
              sendLog(event.isError ? "error" : "info", `tool ended: ${event.toolName}`, toolCallToEvent(toolCall));

              if (event.isError) {
                // Log tool error
                console.error(`[Classroom] Tool ${event.toolName} error:`, event.result);
                finalError = `Tool ${event.toolName} failed.`;
                // Add to agent tasks or errors table in background
                if (client) {
                  void client.from("learning_records").insert({
                    student_name: recordStudentName,
                    subject: recordSubject,
                    record_type: "error",
                    agent_type: "classroom_agent",
                    description: `工具执行失败: ${event.toolName}`,
                    details: { error: event.result },
                  }).then();
                }
              } else if (event.toolName === "save_learning_resource") {
                if (isSavedToolResult(event.result?.details)) {
                  sendEvent({ resourceSaved: event.result.details });
                }
              } else if (event.toolName === "add_memory") {
                sendEvent({ memorySaved: event.result?.details ?? null });
              } else if (event.toolName === "save_error_question") {
                sendEvent({ errorSaved: event.result?.details ?? null });
              }
            } else if (event.type === "message_end") {
              if (event.message.role === "assistant") {
                const assistantMessage = event.message as AssistantMessage;
                finalAssistantText = assistantMessageToDisplayText(assistantMessage);
                const hasToolCall = assistantMessage.content.some((part) => part.type === "toolCall");
                sendLog("info", "assistant message ended", {
                  visibleTextLength: finalAssistantText.length,
                  contentTypes: assistantMessage.content.map((part) => part.type),
                });
                if (!finalAssistantText.trim() && !hasToolCall && !emptyFollowUpQueued) {
                  emptyFollowUpQueued = true;
                  const followUp = buildEmptyAnswerFollowUp(message, recordSubject);
                  agent.followUp(followUp);
                  sendLog("warn", "assistant produced no visible text; queued pi-agent follow-up", {
                    followUp: "empty-answer recovery follow-up",
                  });
                }
              }
            }
          });

          // Run the agent loop by prompting it with the user message
          await agent.prompt(message);

          if (!finalAssistantText && hiddenThinking.trim()) {
            console.warn("[classroom] Model returned thinking without visible text; using classroom fallback if needed.");
            sendLog("warn", "model returned thinking without visible text", {
              hiddenThinkingLength: hiddenThinking.length,
            });
          }

          // Final aggregated result (for backward compat)
          if (!finalError && liveComponent) {
             sendEvent({ liveComponent });
          }

          const reconciledContent = reconcileStreamedContent(fullContent, finalAssistantText, sendEvent);
          fullContent = reconciledContent;

          if (!finalError && !fullContent.trim()) {
            const fallbackTopic = inferFallbackTopic(
              `${message}\n${memoryContext}\n${classroomHistoryContext}\n${resourceContext}`
            );
            const fallbackContent = buildClassroomFallback({
              message,
              subject: recordSubject,
              memoryContext,
              historyContext: classroomHistoryContext,
              resourceContext,
            });
            fullContent = fallbackContent;
            sendEvent({ content: fallbackContent });
            sendLog("warn", "visible answer was empty, generated contextual fallback", {
              fallbackLength: fallbackContent.length,
            });
            if (!liveComponent) {
              const fallbackComponent = buildFallbackLiveComponent(fallbackTopic);
              if (fallbackComponent) {
                liveComponent = fallbackComponent;
                sendEvent({ liveComponent: fallbackComponent });
                sendLog("warn", "generated fallback Stage component", {
                  topic: fallbackTopic,
                  description: fallbackComponent.description,
                });
              }
            }
          }
          const knowledgePoints = inferKnowledgePoints(`${message}\n${fullContent}\n${resourceContext}`);

          // 对话全文只进入课堂历史；记忆和资料只保存知识点/错题/薄弱点等高价值信号。
          persistClassroomHistory({
            message,
            answer: fullContent,
            sessionId,
            subject: recordSubject,
            knowledgePoints,
            liveComponent,
            toolCalls: [...toolCalls.values()],
          });

          if (!finalError) {
            const artifactResult = persistClassroomArtifacts({
              message,
              answer: fullContent,
              sessionId,
              studentName: recordStudentName,
              subject: recordSubject,
              stageEvents,
              activeStage,
              knowledgePoints,
            });
            if (artifactResult.knowledgeSaved) sendEvent({ knowledgeSaved: { points: knowledgePoints } });
            if (artifactResult.resourceSaved) sendEvent({ resourceSaved: { forced: true, knowledgePoints } });
            if (artifactResult.stageSaved) sendEvent({ stageSaved: true });
          }

          if (client) {
            saveClassroomRecords(
              client, sessionId, recordStudentName, message,
              fullContent, knowledgePoints.length ? knowledgePoints : relatedPoints, recordSubject, finalError
            ).catch(err => console.error("Background save error:", err));
          }
          // Wait for agent to settle
          await agent.waitForIdle();
          
          // Save the full, raw agent state including all tool calls and results
          if (sessionId) {
            sessionManager.save(sessionId, agent.state.messages);
          }

          sendEvent({ done: true });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "未知错误";
          sendEvent({ error: errMsg });
          sendLog("error", "classroom stream failed", { error: String(error) });
          
          if (client) {
             client.from("learning_records").insert({
               student_name: recordStudentName,
               subject: recordSubject,
               record_type: "error",
               agent_type: "classroom_agent",
               description: `课堂致命错误: ${errMsg}`,
               details: { error: String(error) },
             }).then();
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface ClassroomResourceContext {
  title: string;
  content: string | null;
  subject?: string | null;
}

async function loadClassroomResources(
  client: ReturnType<typeof getSupabaseClient>,
  subject: string | undefined
): Promise<ClassroomResourceContext[]> {
  const localResources = resourceStore.list({ subject, limit: 5 });
  if (!client) return localResources;

  let query = client
    .from("learning_resources")
    .select("title, content, subject, tags, category")
    .eq("is_shared", true)
    .order("created_at", { ascending: false })
    .limit(5);

  if (subject) query = query.eq("subject", subject);

  const { data, error } = await query;

  if (error) {
    console.warn("[classroom] Supabase resource lookup failed, using local resources:", error.message);
    return localResources;
  }

  return [
    ...(data || []).map((resource: { title: string; content: string | null; subject?: string | null }) => ({
      title: resource.title,
      content: resource.content,
      subject: resource.subject,
    })),
    ...localResources,
  ].slice(0, 5);
}

function inferSubjectFromResources(resources: ClassroomResourceContext[]): string | undefined {
  const counts = new Map<string, number>();
  for (const resource of resources) {
    if (!resource.subject) continue;
    counts.set(resource.subject, (counts.get(resource.subject) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function normalizeStageEvents(value: unknown): StageEventContext[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-12)
    .map((item): StageEventContext | null => {
      if (!isRecord(item)) return null;
      const type = typeof item.type === "string" && item.type.trim() ? item.type.trim() : "event";
      const description =
        typeof item.description === "string" && item.description.trim()
          ? item.description.trim().slice(0, 120)
          : undefined;
      const ts = typeof item.ts === "string" ? item.ts : undefined;
      return {
        type: type.slice(0, 80),
        payload: item.payload ?? null,
        ts,
        description,
      };
    })
    .filter((item): item is StageEventContext => item !== null);
}

function normalizeActiveStage(value: unknown): ActiveStageContext | null {
  if (!isRecord(value)) return null;
  const description =
    typeof value.description === "string" && value.description.trim()
      ? value.description.trim().slice(0, 160)
      : undefined;
  return description ? { description } : null;
}

function formatStageContext(events: StageEventContext[], activeStage: ActiveStageContext | null): string {
  if (!events.length && !activeStage) return "";

  const lines = [
    "<stage-context>",
    "[System note: These are recent student interactions from the live Stage. Use them to adapt the next answer.]",
  ];

  if (activeStage?.description) {
    lines.push(`Active Stage: ${activeStage.description}`);
  }

  if (events.length > 0) {
    lines.push("Recent Stage events:");
    for (const event of events.slice(-8)) {
      const payload = compactText(stringifyStagePayload(event.payload), 500);
      lines.push(`- ${event.type}${event.description ? ` (${event.description})` : ""}: ${payload}`);
    }
  }

  lines.push("</stage-context>");
  return lines.join("\n");
}

function formatStageEventForSearch(event: StageEventContext): string {
  return `${event.type} ${event.description ?? ""} ${stringifyStagePayload(event.payload)}`;
}

function stringifyStagePayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "number" || typeof payload === "boolean") return String(payload);
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assistantMessageToDisplayText(message: AssistantMessage): string {
  const text = message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");

  return stripThinkingBlocks(text);
}

function reconcileStreamedContent(
  streamed: string,
  finalText: string,
  sendEvent: (data: Record<string, unknown>) => void
): string {
  const visibleStreamed = stripThinkingBlocks(streamed);
  const final = stripThinkingBlocks(finalText).trim();

  if (!final) {
    if (visibleStreamed !== streamed) sendEvent({ replaceContent: visibleStreamed });
    return visibleStreamed;
  }
  if (visibleStreamed.trim() === final) {
    if (visibleStreamed !== streamed) sendEvent({ replaceContent: visibleStreamed });
    return visibleStreamed;
  }

  if (final.startsWith(visibleStreamed)) {
    const suffix = final.slice(visibleStreamed.length);
    if (suffix) sendEvent({ content: suffix });
    return final;
  }

  sendEvent({ replaceContent: final });
  return final;
}

function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/<\/think>/gi, "")
    .trim();
}

function isSavedToolResult(details: unknown): details is { saved: true } {
  return isRecord(details) && details.saved === true;
}

function buildEmptyAnswerFollowUp(message: string, subject: string): AgentMessage {
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: [
          "上一轮没有产生可见教学正文。请作为课堂 agent 继续完成这一轮，不要停在空回复。",
          `学科：${subject}`,
          `学生原始问题：${message}`,
          "要求：",
          "1. 先给出完整、具体、可读的教学回答。",
          "2. 如果主题适合互动，调用 render_live_component 生成黑板演示。",
          "3. 如果有明确知识点，调用 add_memory 或 save_learning_resource 记录。",
          "4. 不要只调用工具；工具后要继续总结给学生。",
        ].join("\n"),
      },
    ],
    timestamp: Date.now(),
  };
}

function toolCallToEvent(toolCall: ToolCallSnapshot): Record<string, unknown> {
  return {
    id: toolCall.id,
    name: toolCall.name,
    status: toolCall.status,
    args: toolCall.args,
    result: toolCall.result,
    startedAt: toolCall.startedAt,
    endedAt: toolCall.endedAt,
  };
}

function safeToolPayload(value: unknown): unknown {
  if (value === undefined || value === null) return value ?? null;
  if (typeof value === "string") return compactText(value, 2500);
  if (typeof value === "number" || typeof value === "boolean") return value;
  try {
    return JSON.parse(compactText(JSON.stringify(value), 4000)) as unknown;
  } catch {
    return compactText(String(value), 2500);
  }
}

function inferKnowledgePoints(text: string): string[] {
  const points = new Set<string>();
  const commonPhysicsPoints = [
    "电磁感应",
    "楞次定律",
    "法拉第电磁感应定律",
    "磁通量",
    "右手定则",
    "左手定则",
    "感应电流",
    "感应电动势",
    "自感",
    "互感",
  ];

  for (const point of commonPhysicsPoints) {
    if (text.includes(point)) points.add(point);
  }

  const matches = text.match(/[\u4e00-\u9fa5A-Za-z0-9·+\-]{2,24}(?:定律|公式|概念|原理|规则|方法|模型|实验|单位|性质|知识点)/g) ?? [];
  for (const match of matches) points.add(match);

  return [...points].slice(0, 8);
}

function buildClassroomFallback(input: ClassroomFallbackInput): string {
  const topic = inferFallbackTopic(
    `${input.message}\n${input.memoryContext}\n${input.historyContext}\n${input.resourceContext}`
  );

  if (topic === "电磁感应") {
    return [
      "我们就从**电磁感应**的核心概念开始。",
      "",
      "**一句话理解**：当穿过闭合回路的磁通量发生变化时，回路中会产生感应电动势；如果回路是闭合的，就会出现感应电流。",
      "",
      "可以把它想成：磁场不是只“存在”在那里，它的变化会推动电荷运动。比如导体棒在磁场中切割磁感线时，导体里的自由电子受到磁场力作用，电荷被分开，于是两端出现电势差；接成闭合回路后就形成电流。",
      "",
      "接下来最重要的三件事是：",
      "1. **磁通量**：描述“穿过回路的磁场有多少”。",
      "2. **法拉第电磁感应定律**：磁通量变化越快，感应电动势越大。",
      "3. **楞次定律**：感应电流的方向总是阻碍引起它的磁通量变化。",
      "",
      "我们下一步可以先用一个互动黑板演示“导体棒切割磁感线”，再看公式 `E = B L v` 是怎么来的。",
    ].join("\n");
  }

  if (topic) {
    return [
      `我们先抓住 **${topic}** 的核心概念。`,
      "",
      `学习一个知识点时，先不要急着背定义，可以按这三个问题来理解：`,
      "1. 它描述的现象是什么？",
      "2. 哪些量会影响它？",
      "3. 遇到题目时用什么判断方法或公式？",
      "",
      `你现在可以先告诉我：你想从 ${topic} 的“概念理解”“公式推导”“例题应用”还是“互动演示”开始？如果你不选，我会默认从概念和一个简单例子讲起。`,
    ].join("\n");
  }

  if (input.subject === "物理") {
    return [
      "可以，我们继续学物理。",
      "",
      "如果你暂时没指定知识点，我建议按“现象 -> 概念 -> 公式 -> 例题 -> 黑板互动”的顺序学。比如你想学电磁感应，我们会先回答一个核心问题：**磁场变化为什么能产生电流？**",
      "",
      "你可以直接说具体主题，例如“电磁感应”“楞次定律”“磁通量”，我会接着讲并生成互动黑板。",
    ].join("\n");
  }

  return [
    `可以，我们继续学${input.subject === "通用" ? "" : input.subject}。`,
    "",
    "我这轮没有拿到模型的可见正文，所以先给你一个可继续的学习入口：请说出你想学的知识点，或者选择“概念 / 公式 / 例题 / 互动演示”中的一个方向，我会接着推进。",
  ].join("\n");
}

function inferFallbackTopic(text: string): string | null {
  const knownTopics = [
    "电磁感应",
    "楞次定律",
    "法拉第电磁感应定律",
    "磁通量",
    "右手定则",
    "感应电流",
    "感应电动势",
    "自感",
    "互感",
  ];

  for (const topic of knownTopics) {
    if (text.includes(topic)) return topic;
  }

  const match = text.match(/(?:学习|讲|解释|继续学|核心概念|知识点)[：:，,\s]*([\u4e00-\u9fa5A-Za-z0-9·+\-]{2,18})/);
  const candidate = match?.[1]?.trim();
  if (!candidate || candidate.startsWith("这个") || candidate.includes("知识点")) return null;
  return candidate;
}

function buildFallbackLiveComponent(topic: string | null): Record<string, string> | null {
  if (topic !== "电磁感应") return null;

  return {
    description: "电磁感应：导体棒切割磁感线互动演示",
    html: [
      '<main class="emi-lab">',
      '  <section class="scene" aria-label="电磁感应互动演示">',
      '    <div class="field-lines">',
      '      <span></span><span></span><span></span><span></span><span></span>',
      "    </div>",
      '    <div class="rail rail-top"></div>',
      '    <div class="rail rail-bottom"></div>',
      '    <div id="rod" class="rod"></div>',
      '    <div class="meter">',
      '      <div class="meter-label">感应电动势</div>',
      '      <div id="emf">E = 0.60 V</div>',
      "    </div>",
      "  </section>",
      '  <section class="controls">',
      '    <label>速度 v: <strong id="speedText">0.60 m/s</strong></label>',
      '    <input id="speed" type="range" min="0" max="1.5" step="0.1" value="0.6" />',
      '    <label>磁场 B: <strong id="fieldText">0.50 T</strong></label>',
      '    <input id="field" type="range" min="0.1" max="1.2" step="0.1" value="0.5" />',
      '    <button id="check">记录观察</button>',
      "  </section>",
      '  <p class="hint">拖动速度和磁场，观察 E = B L v。这里取导体棒长度 L = 2 m。</p>',
      "</main>",
    ].join("\n"),
    css: [
      ".emi-lab { display:grid; gap:16px; color:#0f172a; }",
      ".scene { position:relative; min-height:260px; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; background:#f8fafc; }",
      ".field-lines { position:absolute; inset:0; display:grid; grid-template-columns:repeat(5,1fr); align-items:center; opacity:.72; }",
      ".field-lines span { justify-self:center; width:34px; height:34px; border-radius:50%; border:2px solid #38bdf8; position:relative; }",
      ".field-lines span:after { content:'x'; position:absolute; inset:0; display:grid; place-items:center; color:#0284c7; font-weight:700; }",
      ".rail { position:absolute; left:46px; right:46px; height:6px; border-radius:999px; background:#334155; }",
      ".rail-top { top:82px; } .rail-bottom { bottom:82px; }",
      ".rod { position:absolute; top:64px; bottom:64px; left:42%; width:14px; border-radius:999px; background:#f97316; box-shadow:0 0 0 4px rgba(249,115,22,.18); transition:left .25s ease; }",
      ".meter { position:absolute; right:16px; top:16px; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; background:white; min-width:120px; }",
      ".meter-label { font-size:12px; color:#64748b; } #emf { font-size:20px; font-weight:700; color:#059669; }",
      ".controls { display:grid; gap:8px; } label { font-size:13px; } input { width:100%; }",
      "button { width:max-content; border:1px solid #10b981; background:#10b981; color:white; border-radius:6px; padding:8px 12px; cursor:pointer; }",
      ".hint { margin:0; font-size:12px; color:#64748b; }",
    ].join("\n"),
    js: [
      "const L = 2;",
      "const speed = document.getElementById('speed');",
      "const field = document.getElementById('field');",
      "const speedText = document.getElementById('speedText');",
      "const fieldText = document.getElementById('fieldText');",
      "const emf = document.getElementById('emf');",
      "const rod = document.getElementById('rod');",
      "function update(source) {",
      "  const v = Number(speed.value);",
      "  const B = Number(field.value);",
      "  const E = B * L * v;",
      "  speedText.textContent = v.toFixed(2) + ' m/s';",
      "  fieldText.textContent = B.toFixed(2) + ' T';",
      "  emf.textContent = 'E = ' + E.toFixed(2) + ' V';",
      "  rod.style.left = (18 + Math.min(64, v * 42)) + '%';",
      "  if (window.HeurisStage) window.HeurisStage.emit('experiment-result', {",
      "    knowledgePoint: '电磁感应', source, B, L, v, emf: Number(E.toFixed(2)), formula: 'E = B L v'",
      "  });",
      "}",
      "speed.addEventListener('input', () => update('speed'));",
      "field.addEventListener('input', () => update('magnetic-field'));",
      "document.getElementById('check').addEventListener('click', () => update('student-observation'));",
      "update('ready');",
    ].join("\n"),
  };
}

interface PersistArtifactResult {
  knowledgeSaved: boolean;
  resourceSaved: boolean;
  stageSaved: boolean;
}

function persistClassroomHistory(input: {
  message: string;
  answer: string;
  sessionId?: string;
  subject: string;
  knowledgePoints: string[];
  liveComponent: Record<string, string> | null;
  toolCalls: ToolCallSnapshot[];
}) {
  classroomHistoryStore.add({
    sessionId: input.sessionId,
    subject: input.subject,
    role: "student",
    content: input.message,
    messageType: "question",
    knowledgePoints: input.knowledgePoints,
  });

  if (input.answer.trim()) {
    classroomHistoryStore.add({
      sessionId: input.sessionId,
      subject: input.subject,
      role: "agent",
      content: input.answer,
      messageType: "answer",
      knowledgePoints: input.knowledgePoints,
      liveComponent: input.liveComponent,
      toolCalls: input.toolCalls.map(toolCallToEvent),
    });
  }
}

function persistClassroomArtifacts(input: {
  message: string;
  answer: string;
  sessionId?: string;
  studentName: string;
  subject: string;
  stageEvents: StageEventContext[];
  activeStage: ActiveStageContext | null;
  knowledgePoints: string[];
}): PersistArtifactResult {
  const tags = [
    "classroom",
    `subject:${input.subject}`,
    ...input.knowledgePoints.map((point) => `kp:${point}`),
  ];
  let knowledgeSaved = false;
  let resourceSaved = false;
  let stageSaved = false;

  if (input.knowledgePoints.length > 0) {
    memoryStore.add(
      [
        `[课堂知识点] ${input.knowledgePoints.join("、")}`,
        `问题：${input.message}`,
        `摘要：${compactText(input.answer, 500)}`,
      ].join("\n"),
      {
        source: "classroom",
        session_id: input.sessionId,
        importance: 2,
        tags: ["knowledge-point", ...tags],
      }
    );
    knowledgeSaved = true;
  }

  if (input.stageEvents.length > 0) {
    memoryStore.add(
      [
        "[互动黑板结果]",
        input.activeStage?.description ? `黑板：${input.activeStage.description}` : "",
        ...input.stageEvents.slice(-6).map((event) => `${event.type}：${compactText(stringifyStagePayload(event.payload), 280)}`),
      ]
        .filter(Boolean)
        .join("\n"),
      {
        source: "classroom",
        session_id: input.sessionId,
        importance: 2,
        tags: ["stage-event", ...tags],
      }
    );
    stageSaved = true;
  }

  if (input.knowledgePoints.length > 0) {
    resourceStore.add({
      title: `知识点卡片 - ${makeArtifactTitle(input)}`,
      subject: input.subject,
      category: "knowledge-point",
      content: buildClassroomNote(input),
      tags: ["knowledge-point", ...tags],
      difficulty: "medium",
      created_by: "classroom_agent",
    });
    resourceSaved = true;
  }

  return { knowledgeSaved, resourceSaved, stageSaved };
}

function makeArtifactTitle(input: { message: string; knowledgePoints: string[] }): string {
  const topic = input.knowledgePoints[0] ?? compactText(input.message, 18);
  return `${topic} - ${new Date().toLocaleDateString("zh-CN")}`;
}

function buildClassroomNote(input: {
  message: string;
  answer: string;
  subject: string;
  stageEvents: StageEventContext[];
  activeStage: ActiveStageContext | null;
  knowledgePoints: string[];
}): string {
  const knowledge = input.knowledgePoints.length
    ? input.knowledgePoints.map((point) => `- ${point}`).join("\n")
    : "- 待从后续对话中继续归纳";

  return [
    `# ${makeArtifactTitle(input)}`,
    "",
    `**学科**：${input.subject}`,
    "",
    "## 本轮问题",
    input.message,
    "",
    "## 知识点",
    knowledge,
    "",
    "## 知识点讲解",
    input.answer,
    "",
    "## 互动黑板结果",
    buildStageNote(input.stageEvents, input.activeStage),
    "",
    "## 下次衔接",
    "继续从本轮知识点出发，先回顾关键概念，再用例题或互动演示巩固。",
  ].join("\n");
}

function buildStageNote(events: StageEventContext[], activeStage: ActiveStageContext | null): string {
  if (!events.length && !activeStage) return "- 本轮未收到黑板交互结果";

  const lines: string[] = [];
  if (activeStage?.description) {
    lines.push(`- 当前黑板：${activeStage.description}`);
  }
  for (const event of events.slice(-6)) {
    lines.push(`- ${event.type}：${compactText(stringifyStagePayload(event.payload), 240) || "(空)"}`);
  }
  return lines.join("\n");
}

function compactText(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}…`;
}

async function saveClassroomRecords(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  sessionId: string | undefined,
  studentName: string | undefined,
  message: string,
  fullContent: string,
  relatedPoints: string[],
  subject: string | undefined,
  finalError: string | null
) {
  try {
    if (sessionId && !sessionId.startsWith("local-")) {
      await client.from("classroom_messages").insert({
        session_id: sessionId,
        role: "student",
        sender: studentName || "学生",
        content: message,
        message_type: "question",
      });
      
      if (!finalError && fullContent) {
        await client.from("classroom_messages").insert({
          session_id: sessionId,
          role: "agent",
          sender: "课堂互动智能体",
          content: fullContent,
          message_type: "answer",
          agent_type: "classroom_agent",
          related_knowledge_points: relatedPoints,
        });
      }
    }
    await client.from("learning_records").insert({
      student_name: studentName || "匿名学生",
      subject: subject || "通用",
      record_type: "classroom",
      agent_type: "classroom_agent",
      description: `课堂提问：${message.substring(0, 100)}`,
      details: { question: message, answer_length: fullContent.length },
    });
  } catch (err) {
    console.error("[classroom] Failed to save records:", err);
  }
}

// 获取课堂会话列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json({ success: true, data: [] });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = client
      .from("classroom_sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
