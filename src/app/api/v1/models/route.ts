/**
 * OpenAI-compatible models listing
 * GET /api/v1/models
 *
 * Returns available models from the configured LLM backend.
 */
import { NextResponse } from "next/server";

function getLLMConfig() {
  return {
    baseUrl: process.env.LLM_BASE_URL || "http://localhost:11434/v1",
    apiKey: process.env.LLM_API_KEY || "ollama",
  };
}

export async function GET() {
  const { baseUrl, apiKey } = getLLMConfig();

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: { message: `Upstream ${res.status}`, type: "upstream_error" } },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    // Return a minimal model list so callers don't break when backend is offline
    const defaultModel = process.env.LLM_MODEL || "qwen2.5:7b";
    console.warn("[/api/v1/models] LLM backend unreachable:", err);
    return NextResponse.json({
      object: "list",
      data: [
        {
          id: defaultModel,
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "local",
        },
      ],
    });
  }
}
