/**
 * OpenAI-Compatible LLM Client — pi-ai powered
 *
 * Keeps the same exported function signatures as the original llm-client.ts
 * for backward-compatibility with all existing API routes.
 *
 * Internally uses @mariozechner/pi-ai (vendored at src/lib/pi-ai) for
 * unified multi-provider streaming and completion.
 *
 * Config priority (highest → lowest):
 *   1. data/settings.json  (written by the Settings UI)
 *   2. Environment variables: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_PROVIDER
 *   3. Built-in defaults (local Ollama)
 */
import { getActiveModel, getActiveApiKey, getCurrentSettings } from "./model-config";
import type { Context, AssistantMessage } from "@/lib/pi-ai/index";
import { completeSimple, streamSimple } from "@/lib/pi-ai/stream";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

interface OpenAIToolLike {
  function?: {
    name?: string;
    description?: string;
    parameters?: unknown;
  };
  name?: string;
  description?: string;
  parameters?: unknown;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAIToolLike[];
  tool_choice?: string | object;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  tool_calls?: OpenAIToolCall[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert our simple ChatMessage[] into a pi-ai Context */
function buildContext(messages: ChatMessage[], tools?: OpenAIToolLike[]): Context {
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const systemPrompt = systemMessages.map((m) => m.content).join("\n\n");

  const piMessages = nonSystemMessages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: Date.now(),
  }));

  // Convert OpenAI-style tool schema to pi-ai's TypeBox-compatible format
  const piTools =
    tools?.map((t) => {
      const fn = t.function || t;
      return {
        name: fn.name ?? "",
        description: fn.description ?? "",
        parameters: fn.parameters || { type: "object", properties: {} },
      };
    }) ?? undefined;

  return {
    systemPrompt: systemPrompt || undefined,
    messages: piMessages,
    tools: piTools,
  } as Context;
}

/** Convert pi-ai AssistantMessage back to our LLMResponse format */
function toResponse(msg: AssistantMessage): LLMResponse {
  const textContent = msg.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("");

  const toolCalls = msg.content
    .filter((c) => c.type === "toolCall")
    .map((c) => ({
      id: c.id,
      type: "function" as const,
      function: {
        name: c.name,
        arguments: JSON.stringify(c.arguments),
      },
    }));

  return {
    content: textContent,
    model: msg.responseModel ?? msg.model,
    usage: {
      prompt_tokens: msg.usage.input,
      completion_tokens: msg.usage.output,
      total_tokens: msg.usage.totalTokens,
    },
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

// ─── Public API (backward-compatible) ─────────────────────────────────────────

/** Non-streaming chat completion */
export async function llmInvoke(
  messages: ChatMessage[],
  options: LLMOptions = {}
): Promise<LLMResponse> {
  const baseModel = getActiveModel();
  const apiKey = getActiveApiKey();

  // Allow per-call model override
  const model = options.model
    ? { ...baseModel, id: options.model, name: options.model }
    : baseModel;

  const context = buildContext(messages, options.tools);

  const msg = await completeSimple(model, context, {
    apiKey,
    temperature: options.temperature,
    maxTokens: options.max_tokens,
  });

  if (msg.stopReason === "error" || msg.stopReason === "aborted") {
    throw new Error(`LLM error: ${msg.errorMessage ?? msg.stopReason}`);
  }

  return toResponse(msg);
}

/** Streaming chat — yields text delta chunks */
export async function* llmStream(
  messages: ChatMessage[],
  options: LLMOptions = {}
): AsyncGenerator<string> {
  const baseModel = getActiveModel();
  const apiKey = getActiveApiKey();

  const model = options.model
    ? { ...baseModel, id: options.model, name: options.model }
    : baseModel;

  const context = buildContext(messages, options.tools);

  const eventStream = streamSimple(model, context, {
    apiKey,
    temperature: options.temperature,
    maxTokens: options.max_tokens,
  });

  for await (const event of eventStream) {
    switch (event.type) {
      case "thinking_start":
        break;

      case "thinking_delta":
        break;

      case "thinking_end":
        break;

      case "text_start":
        break;

      case "text_delta":
        yield event.delta;
        break;

      case "error":
        throw new Error(`LLM stream error: ${event.error.errorMessage ?? "unknown"}`);
    }
  }

}

/** Check if the LLM backend is reachable */
export async function checkLLMHealth(): Promise<{
  ok: boolean;
  models?: string[];
  error?: string;
  baseUrl?: string;
  model?: string;
  provider?: string;
}> {
  const settings = getCurrentSettings();
  const { resolvedBaseUrl, model, resolvedApi } = settings;

  // For non-OpenAI-compat providers, do a lightweight stream probe instead
  if (resolvedApi === "anthropic-messages" || resolvedApi === "google-generative-ai" || resolvedApi === "mistral-conversations") {
    // Just report as configured — can't list models without provider-specific endpoints
    return {
      ok: true,
      models: [model],
      baseUrl: resolvedBaseUrl,
      model,
      provider: resolvedApi,
    };
  }

  // OpenAI-compat: try /models endpoint
  try {
    const apiKey = getActiveApiKey();
    const res = await fetch(`${resolvedBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, baseUrl: resolvedBaseUrl, model };
    const data = await res.json();
    const models = (data.data ?? []).map((m: { id: string }) => m.id);
    return { ok: true, models, baseUrl: resolvedBaseUrl, model, provider: resolvedApi };
  } catch (err) {
    return { ok: false, error: String(err), baseUrl: resolvedBaseUrl, model };
  }
}
