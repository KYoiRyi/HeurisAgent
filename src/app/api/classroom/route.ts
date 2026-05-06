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

export async function POST(request: NextRequest) {
  try {
    const { message, sessionId, subject, studentName } = await request.json();
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

    // Auto-inject memory context from the active turn plus previously saved talks.
    const memoryContext = memoryStore.buildContextFromQueries(
      [message, legacyStudentName, legacySubject, inferredResourceSubject],
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
      `${sessionContext}${resourceContext}\n\n` +
      "不要依赖旧版的手动学科/学生姓名选择器；请优先从当前对话、课堂资料、技能说明和记忆上下文中推断学习者画像、主题和薄弱点。若确实缺少关键信息，再自然追问。\n\n" +
      "If you need to show an interactive simulation, diagram, or applet, you MUST call the render_live_component tool! Do NOT write markdown code blocks for interactive apps.";

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
                fullContent += chunk.delta;
                sendEvent({ content: chunk.delta });
              } else if (chunk.type === "thinking_end") {
                fullContent += "\n\n";
                sendEvent({ content: "\n\n" });
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
                sendEvent({ content: `\n\n*(正在渲染互动黑板组件: ${liveComponent.description || "加载中..."})*` });
              } else if (event.toolName === "search_memory") {
                sendEvent({ content: `\n\n*[系统：智能体正在检索记忆...]*` });
              } else if (event.toolName === "add_memory") {
                sendEvent({ content: `\n\n*[系统：智能体正在保存上下文记忆...]*` });
              } else if (event.toolName === "save_learning_resource") {
                sendEvent({ content: `\n\n*[系统：智能体正在生成课堂板书/资源...]*` });
              } else if (event.toolName === "save_error_question") {
                sendEvent({ content: `\n\n*[系统：智能体已记录错题分析，便于后续复习]*` });
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
                sendEvent({
                  content: "\n\n*[系统：课堂资料已保存并同步到资源库]*",
                  resourceSaved: event.result?.details ?? null,
                });
              }
            } else if (event.type === "message_end") {
              if (event.message.role === "assistant") {
                finalAssistantText = assistantMessageToDisplayText(event.message as AssistantMessage);
              }
            }
          });

          // Run the agent loop by prompting it with the user message
          await agent.prompt(message);

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

          // 强制保存：每一轮都保存对话记忆、课堂笔记/课件、知识点记忆。
          if (!finalError) {
            persistClassroomArtifacts({
              message,
              answer: fullContent,
              sessionId,
              studentName: recordStudentName,
              subject: recordSubject,
              knowledgePoints,
            });
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

function assistantMessageToDisplayText(message: AssistantMessage): string {
  const text = message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");

  if (text.trim()) return text;

  return message.content
    .filter((part): part is { type: "thinking"; thinking: string } => part.type === "thinking")
    .map((part) => part.thinking)
    .join("\n\n");
}

function reconcileStreamedContent(
  streamed: string,
  finalText: string,
  sendEvent: (data: Record<string, unknown>) => void
): string {
  const final = finalText.trim();
  if (!final) return streamed;
  if (streamed.trim() === final) return streamed;

  if (final.startsWith(streamed)) {
    const suffix = final.slice(streamed.length);
    if (suffix) sendEvent({ content: suffix });
    return final;
  }

  sendEvent({ replaceContent: final });
  return final;
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

function persistClassroomArtifacts(input: {
  message: string;
  answer: string;
  sessionId?: string;
  studentName: string;
  subject: string;
  knowledgePoints: string[];
}) {
  const tags = [
    "classroom",
    "conversation-turn",
    `subject:${input.subject}`,
    ...input.knowledgePoints.map((point) => `kp:${point}`),
  ];

  memoryStore.syncTurn(input.message, input.answer, input.sessionId, {
    studentName: input.studentName,
    subject: input.subject,
    source: "classroom",
  });

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
  }

  resourceStore.add({
    title: `课堂课件与笔记 - ${makeArtifactTitle(input)}`,
    subject: input.subject,
    category: "note",
    content: buildClassroomNote(input),
    tags,
    difficulty: "medium",
    created_by: "classroom_agent",
  });
}

function makeArtifactTitle(input: { message: string; knowledgePoints: string[] }): string {
  const topic = input.knowledgePoints[0] ?? compactText(input.message, 18);
  return `${topic} - ${new Date().toLocaleDateString("zh-CN")}`;
}

function buildClassroomNote(input: {
  message: string;
  answer: string;
  subject: string;
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
    "## 课堂笔记",
    input.answer,
    "",
    "## 下次衔接",
    "继续从本轮知识点出发，先回顾关键概念，再用例题或互动演示巩固。",
  ].join("\n");
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
