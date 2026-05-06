import { NextRequest, NextResponse } from "next/server";
import { llmInvoke } from "@/lib/llm-client";
import { getSupabaseClient } from "@/storage/database/supabase-client";

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
    const { message, sessionId, subject, studentName, history } =
      await request.json();

    if (!message) {
      return NextResponse.json({ error: "消息内容不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取会话上下文（可选，DB可能不可用）
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

    // 获取相关教学资源（可选）
    let resourceContext = "";
    if (client && subject) {
      const { data: resources } = await client
        .from("learning_resources")
        .select("title, content, tags")
        .eq("subject", subject)
        .eq("is_shared", true)
        .limit(3);

      if (resources && resources.length > 0) {
        resourceContext =
          "\n\n相关教学资源参考：\n" +
          resources
            .map(
              (r: { title: string; content: string | null }, i: number) =>
                `${i + 1}. ${r.title}${r.content ? `：${r.content.substring(0, 200)}` : ""}`
            )
            .join("\n");
      }
    }

    // 构建 LLM 消息
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string; tool_calls?: any }> = [
      {
        role: "system",
        content: CLASSROOM_SYSTEM_PROMPT + "\n\n" + `${sessionContext}${resourceContext}\n\n学科：${subject || "通用"}，学生：${studentName || "同学"}\n\nIf you need to show an interactive simulation, diagram, or applet, you MUST call the render_live_component tool! Do NOT write markdown code blocks for interactive apps.`
      },
    ];

    // 添加历史消息上下文
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-6)) {
        messages.push({
          role: msg.role === "student" ? "user" : "assistant",
          content: msg.content,
        });
      }
    }
    messages.push({ role: "user", content: message });

    // 流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = "";
        try {
          const classroomTools = [
            {
              type: "function",
              function: {
                name: "render_live_component",
                description: "Generate a live interactive UI component (HTML/JS) to render on the Stage. Use this to show simulations, interactive widgets, or dynamic web elements to the student.",
                parameters: {
                  type: "object",
                  properties: {
                    html: { type: "string", description: "The HTML structure of the interactive component" },
                    css: { type: "string", description: "Any custom CSS styles (vanilla CSS)" },
                    js: { type: "string", description: "Vanilla JavaScript to make the component interactive. Do not use window.onload or DOMContentLoaded, just write the script." },
                    description: { type: "string", description: "A brief description of what this component is" }
                  },
                  required: ["html", "description"]
                }
              }
            }
          ];

          const response = await llmInvoke(messages, { 
            temperature: 0.7,
            tools: classroomTools
          });
          
          fullContent = response.content;
          let liveComponent = null;

          if (response.tool_calls && response.tool_calls.length > 0) {
            const tc = response.tool_calls[0];
            if (tc.function?.name === "render_live_component") {
              try {
                liveComponent = JSON.parse(tc.function.arguments);
              } catch (e) {
                console.error("Failed to parse tool call arguments", e);
              }
            }
          }
          
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ content: fullContent, liveComponent })}\n\n`)
          );

          // 异步保存记录（不阻塞响应）
          if (client) {
            void saveClassroomRecords(
              client, sessionId, studentName, message,
              fullContent, relatedPoints, subject
            );
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
          );
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "未知错误";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`)
          );
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

async function saveClassroomRecords(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  sessionId: string | undefined,
  studentName: string | undefined,
  message: string,
  fullContent: string,
  relatedPoints: string[],
  subject: string | undefined
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
