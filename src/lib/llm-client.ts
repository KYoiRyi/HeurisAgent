/**
 * OpenAI-Compatible LLM Client
 *
 * Config priority (highest → lowest):
 *   1. data/settings.json  (written by the Settings UI)
 *   2. Environment variables: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
 *   3. Built-in defaults (local Ollama)
 *
 * Works with: Ollama · OpenAI · DeepSeek · LM Studio · any OpenAI-spec API.
 */
import fs from "fs";
import path from "path";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface LLMOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

function getLLMConfig(): LLMConfig {
  // 1. Try settings.json
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
      const s = JSON.parse(raw);
      if (s.baseUrl && s.model) {
        return {
          baseUrl: s.baseUrl,
          apiKey: s.apiKey || "ollama",
          defaultModel: s.model,
        };
      }
    }
  } catch {
    // fall through to env vars
  }

  // 2. Env vars
  return {
    baseUrl: process.env.LLM_BASE_URL || "http://localhost:11434/v1",
    apiKey: process.env.LLM_API_KEY || "ollama",
    defaultModel: process.env.LLM_MODEL || "qwen2.5:7b",
  };
}

/** Non-streaming chat completion */
export async function llmInvoke(
  messages: ChatMessage[],
  options: LLMOptions = {}
): Promise<LLMResponse> {
  const { baseUrl, apiKey, defaultModel } = getLLMConfig();
  const model = options.model || defaultModel;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  return { content, model: data.model ?? model, usage: data.usage };
}

/** Streaming chat — yields text delta chunks */
export async function* llmStream(
  messages: ChatMessage[],
  options: LLMOptions = {}
): AsyncGenerator<string> {
  const { baseUrl, apiKey, defaultModel } = getLLMConfig();
  const model = options.model || defaultModel;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;
      try {
        const json = JSON.parse(trimmed.slice(6));
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // ignore malformed chunks
      }
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
}> {
  const { baseUrl, apiKey, defaultModel } = getLLMConfig();
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, baseUrl, model: defaultModel };
    const data = await res.json();
    const models = (data.data ?? []).map((m: { id: string }) => m.id);
    return { ok: true, models, baseUrl, model: defaultModel };
  } catch (err) {
    return { ok: false, error: String(err), baseUrl, model: defaultModel };
  }
}
