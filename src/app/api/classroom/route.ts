import { NextRequest, NextResponse } from "next/server";
import { getActiveModel, getActiveApiKey } from "@/lib/model-config";
import { Agent } from "@/lib/pi-agent/agent";
import type { AgentEvent as PiAgentEvent } from "@/lib/pi-agent/types";
import { buildClassroomTools } from "@/lib/heuris-agent";
import { loadSkills, formatSkillsForPrompt } from "@/lib/pi-agent/skills";
import type { AssistantMessage } from "@/lib/pi-ai/index";
import path from "path";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { sessionManager } from "@/lib/pi-agent/session-manager";
import { memoryStore } from "@/lib/memory";
import { resourceStore } from "@/lib/resources";
import { classroomHistoryStore } from "@/lib/classroom-history";

const CLASSROOM_SYSTEM_PROMPT = `你是一个专业的课堂互动智能体，擅长实时提问解答和知识点联动讲解。

你的核心能力：
1. **实时提问解答**：对学生提出的问题给出清晰、易懂的解答，注重启发性引导而非直接给答案
2. **知识点联动讲解**：将当前问题与已学知识建立联系，帮助学生构建知识体系
3. **课堂辅助**：提供知识点的多种理解角度、生活化类比、典型例题
4. **互动引导**：通过追问、提示等方式引导学生主动思考

回答要求：
- 语言简洁易懂，适合课堂场景
- 适当使用类比和举例帮助理解
- 关联已学知识点，构建知识网络
- 鼓励学生深入思考，培养探究精神
- 如果是计算题，给出详细解题步骤`;

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
    const memoryContext = memoryStore.buildContextFromQueries(
      [
        message,
        legacyStudentName,
        legacySubject,
        inferredResourceSubject,
        "错题 误区 薄弱点 error-question weakness knowledge-point",
        ...stageEvents.map(formatStageEventForSearch),
      ],
      14
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
        "实时教学执行要求：",
        "- 主聊天必须先给学生一段完整、可读的回答；不要把思考草稿、工具状态或 JSON/代码块混进正文。",
        "- 需要互动实验、图像化推导、课堂练习、测验或可操作黑板时，必须调用 render_live_component 生成 HTML/CSS/JS 到互动黑板。",
        "- 黑板 JS 可以调用 window.HeurisStage.emit(type, payload) 上报学生操作、答案、分数、滑块值和实验结果；下一轮你会在 <stage-context> 中读取这些结果并调整教学。",
        "- 发现新知识点、学习进度、偏好、薄弱点或目标时，必须用 add_memory 保存。",
        "- 发现错题或概念误区时，必须用 save_error_question 保存，并把涉及知识点写清楚。",
        "- 只有识别到明确知识点时，才用 save_learning_resource 保存知识点卡片/课件；不要把普通聊天、寒暄、空泛总结保存成课堂资料。",
        "- 完整对话会按学科写入 classroom history，不要把原始对话全文复制进 add_memory。",
        "If you need to show an interactive simulation, diagram, or applet, you MUST call the render_live_component tool! Do NOT write markdown code blocks for interactive apps.",
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

        const sendEvent = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          agent.subscribe((event: PiAgentEvent) => {
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
            } else if (event.type === "tool_execution_end") {
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
                finalAssistantText = assistantMessageToDisplayText(event.message as AssistantMessage);
              }
            }
          });

          // Run the agent loop by prompting it with the user message
          await agent.prompt(message);

          if (!finalAssistantText && hiddenThinking.trim()) {
            console.warn("[classroom] Model returned thinking without visible text; using classroom fallback if needed.");
          }

          // Final aggregated result (for backward compat)
          if (!finalError && liveComponent) {
             sendEvent({ liveComponent });
          }

          const reconciledContent = reconcileStreamedContent(fullContent, finalAssistantText, sendEvent);
          fullContent = reconciledContent;

          if (!finalError && !fullContent.trim()) {
            const fallbackContent = "可以，我们继续学。你可以直接告诉我想接着哪个知识点，或者让我根据已有记忆继续推进。";
            fullContent = fallbackContent;
            sendEvent({ content: fallbackContent });
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
