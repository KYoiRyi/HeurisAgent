/**
 * POST /api/agent/run
 * Run a one-shot agent task. Returns streaming SSE.
 *
 * Body: { prompt: string, sessionId?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "@/lib/agent-runtime";
import { memoryStore } from "@/lib/memory";
import { llmStream } from "@/lib/llm-client";

export async function POST(request: NextRequest) {
  try {
    const { prompt, sessionId, stream: wantStream } = await request.json();
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    if (wantStream === false) {
      // Non-streaming: use agentRuntime.runTask for full logging
      const result = await agentRuntime.runTask(prompt, { trigger: "manual" });
      return NextResponse.json({ success: true, result });
    }

    // Streaming
    const memCtx = memoryStore.buildContextFromQueries([prompt], 12);
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      {
        role: "system",
        content:
          "你是 HeurisAgent 智能助手。请认真完成用户的任务，给出清晰、有用的回答。\n\n" +
          (memCtx ? memCtx + "\n\n" : "") +
          "当前时间：" + new Date().toLocaleString("zh-CN"),
      },
      { role: "user", content: prompt },
    ];

    const encoder = new TextEncoder();
    let fullContent = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of llmStream(messages, { temperature: 0.6 })) {
            fullContent += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
          }
          // Save every completed turn to long-term memory.
          memoryStore.syncTurn(prompt, fullContent, sessionId, { source: "agent_tool" });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
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
