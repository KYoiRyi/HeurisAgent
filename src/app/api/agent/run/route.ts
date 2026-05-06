/**
 * POST /api/agent/run
 * Run a one-shot agent task. Returns streaming SSE.
 *
 * Body: { prompt: string, sessionId?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { agentRuntime, buildHeurisTools } from "@/lib/heuris-agent";
import { memoryStore } from "@/lib/memory";
import { Agent } from "@/lib/pi-agent/agent";
import type { AgentEvent as PiAgentEvent } from "@/lib/pi-agent/types";
import type { AssistantMessage } from "@/lib/pi-ai/index";
import { getActiveApiKey, getActiveModel } from "@/lib/model-config";

export async function POST(request: NextRequest) {
  try {
    const { prompt, sessionId, stream: wantStream } = await request.json();
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    if (wantStream === false) {
      // Non-streaming: use agentRuntime.runTask for full logging
      const result = await agentRuntime.runTask(prompt, { trigger: "manual" });
      return NextResponse.json({ success: true, result });
    }

    // Streaming through pi-agent so tool calls are visible and available.
    const memCtx = memoryStore.buildContextFromQueries([prompt], 12);
    const systemPrompt =
      [
        "你是 HeurisAgent 智能助手，运行在 pi-agent 工具循环中。",
        "请自主判断是否需要搜索记忆、保存 durable facts、安排后台任务或继续追问。",
        "工具调用会显示给用户，所以参数要清晰、简洁、真实。",
        "工具返回后继续综合结果，给出最终回答。",
        "不要把完整原始对话保存为记忆；只保存偏好、目标、任务结论、可复用事实。",
      ].join("\n") +
      "\n\n" +
      (memCtx ? memCtx + "\n\n" : "") +
      "当前时间：" + new Date().toLocaleString("zh-CN");

    const encoder = new TextEncoder();
    let fullContent = "";
    let finalAssistantText = "";

    const readable = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const agent = new Agent({
            initialState: {
              systemPrompt,
              model: getActiveModel(),
              tools: buildHeurisTools(),
            },
            getApiKey: () => getActiveApiKey(),
            toolExecution: "parallel",
          });

          agent.subscribe((event: PiAgentEvent) => {
            if (event.type === "message_update") {
              const chunk = event.assistantMessageEvent;
              if (chunk.type === "text_delta") {
                fullContent += chunk.delta;
                sendEvent({ content: chunk.delta });
              } else if (chunk.type === "error") {
                sendEvent({ error: chunk.error.errorMessage ?? "LLM error" });
              }
            } else if (event.type === "tool_execution_start") {
              sendEvent({
                toolCall: {
                  id: event.toolCallId,
                  name: event.toolName,
                  status: "running",
                  args: safeToolPayload(event.args),
                  startedAt: new Date().toISOString(),
                },
              });
            } else if (event.type === "tool_execution_update") {
              sendEvent({
                toolCall: {
                  id: event.toolCallId,
                  name: event.toolName,
                  status: "running",
                  args: safeToolPayload(event.args),
                  result: safeToolPayload(event.partialResult),
                },
              });
            } else if (event.type === "tool_execution_end") {
              sendEvent({
                toolCall: {
                  id: event.toolCallId,
                  name: event.toolName,
                  status: event.isError ? "error" : "done",
                  result: safeToolPayload(event.result),
                  endedAt: new Date().toISOString(),
                },
              });
            } else if (event.type === "message_end" && event.message.role === "assistant") {
              finalAssistantText = assistantMessageToText(event.message as AssistantMessage);
            }
          });

          await agent.prompt(prompt);

          if (finalAssistantText && finalAssistantText.trim() !== fullContent.trim()) {
            fullContent = finalAssistantText;
            sendEvent({ replaceContent: finalAssistantText });
          }

          if (fullContent.length > 50) {
            memoryStore.add(`[任务结果] ${prompt.substring(0, 60)}\n${fullContent.substring(0, 500)}`, {
              source: "agent_tool",
              session_id: typeof sessionId === "string" ? sessionId : undefined,
              importance: 1,
              tags: ["task-result"],
            });
          }

          sendEvent({ done: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          sendEvent({ error: msg });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function assistantMessageToText(message: AssistantMessage): string {
  return message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

function safeToolPayload(value: unknown): unknown {
  if (value === undefined || value === null) return value ?? null;
  if (typeof value === "string") return compact(value, 2500);
  if (typeof value === "number" || typeof value === "boolean") return value;
  try {
    return JSON.parse(compact(JSON.stringify(value), 4000)) as unknown;
  } catch {
    return compact(String(value), 2500);
  }
}

function compact(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}
