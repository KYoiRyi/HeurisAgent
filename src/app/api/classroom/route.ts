import { NextRequest, NextResponse } from "next/server";
import { getActiveModel, getActiveApiKey } from "@/lib/model-config";
import { Agent } from "@/lib/pi-agent/agent";
import type { AgentEvent as PiAgentEvent } from "@/lib/pi-agent/types";
import { buildClassroomTools } from "@/lib/heuris-agent";
import { loadSkills, formatSkillsForPrompt } from "@/lib/pi-agent/skills";
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
    const resources = await loadClassroomResources(client, subject);
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

    // Auto-inject memory context for this student
    const memoryContext = memoryStore.buildContextFromQueries([studentName, subject, message], 10);

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
      `${sessionContext}${resourceContext}\n\n学科：${subject || "通用"}，学生：${studentName || "同学"}\n\nIf you need to show an interactive simulation, diagram, or applet, you MUST call the render_live_component tool! Do NOT write markdown code blocks for interactive apps.`;

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
        tools: buildClassroomTools({ studentName, sessionId, subject }),
      },
      getApiKey: () => apiKey,
      toolExecution: "parallel",
    });

    // SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = "";
        let liveComponent: Record<string, string> | null = null;
        let finalError: string | null = null;
        let isThinking = false;

        const sendEvent = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          agent.subscribe((event: PiAgentEvent) => {
            if (event.type === "message_update") {
              const chunk = event.assistantMessageEvent;
              if (chunk.type === "thinking_delta") {
                if (!isThinking) {
                  sendEvent({ content: "<think>\n" });
                  isThinking = true;
                }
                sendEvent({ content: chunk.delta });
              } else if (chunk.type === "text_delta") {
                if (isThinking) {
                  sendEvent({ content: "\n</think>\n" });
                  isThinking = false;
                }
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
                    student_name: studentName || "匿名学生",
                    subject: subject || "通用",
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
            }
          });

          // Run the agent loop by prompting it with the user message
          await agent.prompt(message);

          if (isThinking) {
             sendEvent({ content: "\n</think>\n" });
          }

          // Final aggregated result (for backward compat)
          if (!finalError && liveComponent) {
             sendEvent({ liveComponent });
          }

          // Background decoupled save
          if (!finalError) {
            memoryStore.syncTurn(message, fullContent, sessionId, { studentName, subject });
          }

          if (client) {
            saveClassroomRecords(
              client, sessionId, studentName, message,
              fullContent, relatedPoints, subject, finalError
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
               student_name: studentName || "匿名学生",
               subject: subject || "通用",
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
}

async function loadClassroomResources(
  client: ReturnType<typeof getSupabaseClient>,
  subject: string | undefined
): Promise<ClassroomResourceContext[]> {
  const localResources = resourceStore.list({ subject, limit: 5 });
  if (!client || !subject) return localResources;

  const { data, error } = await client
    .from("learning_resources")
    .select("title, content, tags, category")
    .eq("subject", subject)
    .eq("is_shared", true)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.warn("[classroom] Supabase resource lookup failed, using local resources:", error.message);
    return localResources;
  }

  return [
    ...(data || []).map((resource: { title: string; content: string | null }) => ({
      title: resource.title,
      content: resource.content,
    })),
    ...localResources,
  ].slice(0, 5);
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
    if (sessionId) {
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
