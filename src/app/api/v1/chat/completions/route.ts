/**
 * OpenAI-compatible chat completions proxy
 * POST /api/v1/chat/completions
 *
 * Proxies requests to the configured local LLM backend (Ollama by default).
 * Supports both streaming (SSE) and non-streaming responses.
 *
 * This makes the backend usable as a drop-in OpenAI API for any client.
 */
import { NextRequest, NextResponse } from "next/server";

function getLLMConfig() {
  return {
    baseUrl: process.env.LLM_BASE_URL || "http://localhost:11434/v1",
    apiKey: process.env.LLM_API_KEY || "ollama",
    defaultModel: process.env.LLM_MODEL || "qwen2.5:7b",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { baseUrl, apiKey, defaultModel } = getLLMConfig();

    // Inject default model if none specified
    if (!body.model) {
      body.model = defaultModel;
    }

    const isStream = body.stream === true;

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        // Forward any extra headers the client sent (e.g. x-request-id)
        ...(request.headers.get("x-request-id")
          ? { "x-request-id": request.headers.get("x-request-id")! }
          : {}),
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return NextResponse.json(
        { error: { message: errText, type: "upstream_error", code: upstream.status } },
        { status: upstream.status }
      );
    }

    if (isStream) {
      // Pipe the SSE stream directly back to the client
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const data = await upstream.json();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[/api/v1/chat/completions]", error);
    return NextResponse.json(
      { error: { message, type: "server_error", code: 500 } },
      { status: 500 }
    );
  }
}

// Allow GET to check endpoint availability
export async function GET() {
  return NextResponse.json({
    object: "endpoint",
    path: "/api/v1/chat/completions",
    description: "OpenAI-compatible chat completions endpoint (proxied to local LLM)",
    methods: ["POST"],
  });
}
