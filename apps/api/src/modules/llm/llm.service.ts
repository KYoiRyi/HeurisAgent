import { Injectable } from "@nestjs/common";
import { SettingsService } from "@/modules/settings/settings.service";
import type { Api, AssistantMessage, Context, Model } from "@/llm/pi-ai/index";
import { completeSimple, streamSimple } from "@/llm/pi-ai/stream";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface OpenAIToolLike {
  function?: {
    name?: string;
    description?: string;
    parameters?: unknown;
  };
  name?: string;
  description?: string;
  parameters?: unknown;
}

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
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

@Injectable()
export class LlmService {
  constructor(private readonly settings: SettingsService) {}

  async invoke(messages: ChatMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    const { model, apiKey } = this.resolveModel(options.model);
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

  async *stream(messages: ChatMessage[], options: LLMOptions = {}): AsyncGenerator<string> {
    const { model, apiKey } = this.resolveModel(options.model);
    const context = buildContext(messages, options.tools);

    const events = streamSimple(model, context, {
      apiKey,
      temperature: options.temperature,
      maxTokens: options.max_tokens,
    });

    for await (const event of events) {
      switch (event.type) {
        case "text_delta":
          yield event.delta;
          break;
        case "error":
          throw new Error(`LLM stream error: ${event.error.errorMessage ?? "unknown"}`);
      }
    }
  }

  invokeStream(messages: ChatMessage[], options: LLMOptions = {}): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const generator = this.stream(messages, options);

    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await generator.next();
          if (done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: value })}\n\n`));
        } catch (err) {
          const message = err instanceof Error ? err.message : "stream error";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
          controller.close();
        }
      },
    });
  }

  async health(): Promise<{
    ok: boolean;
    models?: string[];
    error?: string;
    baseUrl?: string;
    model?: string;
    provider?: string;
  }> {
    const settings = await this.settings.get();
    const { resolvedBaseUrl, model, resolvedApi } = settings;

    if (
      resolvedApi === "anthropic-messages" ||
      resolvedApi === "google-generative-ai" ||
      resolvedApi === "mistral-conversations"
    ) {
      return {
        ok: true,
        models: [model],
        baseUrl: resolvedBaseUrl,
        model,
        provider: resolvedApi,
      };
    }

    try {
      const apiKey = this.settings.getActiveApiKey();
      const res = await fetch(`${resolvedBaseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, baseUrl: resolvedBaseUrl, model };
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      const models = (data.data ?? []).map((m) => m.id);
      return { ok: true, models, baseUrl: resolvedBaseUrl, model, provider: resolvedApi };
    } catch (err) {
      return { ok: false, error: String(err), baseUrl: resolvedBaseUrl, model };
    }
  }

  private resolveModel(modelOverride?: string): { model: Model<Api>; apiKey: string } {
    const base = this.settings.getActiveModel();
    const model = modelOverride ? { ...base, id: modelOverride, name: modelOverride } : base;
    return { model, apiKey: this.settings.getActiveApiKey() };
  }
}

function buildContext(messages: ChatMessage[], tools?: OpenAIToolLike[]): Context {
  const systemPrompt = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const piMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content, timestamp: Date.now() }));

  const piTools = tools?.map((t) => {
    const fn = t.function || t;
    return {
      name: fn.name ?? "",
      description: fn.description ?? "",
      parameters: fn.parameters || { type: "object", properties: {} },
    };
  });

  return {
    systemPrompt: systemPrompt || undefined,
    messages: piMessages,
    tools: piTools,
  } as Context;
}

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
      function: { name: c.name, arguments: JSON.stringify(c.arguments) },
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
