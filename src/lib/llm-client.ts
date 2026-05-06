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

/** Sanitize messages for strict APIs (like MiniMax) that reject consecutive identical roles */
function sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return [];
  const sanitized: ChatMessage[] = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const current = messages[i];
    const last = sanitized[sanitized.length - 1];
    
    // Merge consecutive system messages or user messages
    if (current.role === last.role) {
      last.content += "\n\n" + current.content;
    } else {
      sanitized.push({ ...current });
    }
  }
  return sanitized;
}

/** Non-streaming chat completion */
export async function llmInvoke(
  messages: ChatMessage[],
  options: LLMOptions = {}
): Promise<LLMResponse> {
  const { baseUrl, apiKey, defaultModel } = getLLMConfig();
  const model = options.model || defaultModel;
  const temp = Math.max(0.01, Math.min(1.0, options.temperature ?? 0.7));

  const isMiniMax = baseUrl.includes("minimax");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: sanitizeMessages(messages),
      temperature: temp,
      max_tokens: options.max_tokens,
      stream: false,
      ...(isMiniMax ? { reasoning_split: true } : {}), // For MiniMax reasoning models compatibility
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  let content = data.choices?.[0]?.message?.content ?? "";
  
  // Handle MiniMax-style reasoning details
  const reasoningArray = data.choices?.[0]?.message?.reasoning_details;
  if (reasoningArray && Array.isArray(reasoningArray)) {
    const rText = reasoningArray.map((r: any) => r.text || "").join("");
    if (rText) {
      content = `<think>\n${rText}\n</think>\n\n${content}`;
    }
  }

  return { content, model: data.model ?? model, usage: data.usage };
}

/** Streaming chat — yields text delta chunks */
export async function* llmStream(
  messages: ChatMessage[],
  options: LLMOptions = {}
): AsyncGenerator<string> {
  const { baseUrl, apiKey, defaultModel } = getLLMConfig();
  const model = options.model || defaultModel;
  const temp = Math.max(0.01, Math.min(1.0, options.temperature ?? 0.7));
  const isMiniMax = baseUrl.includes("minimax");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: sanitizeMessages(messages),
      temperature: temp,
      max_tokens: options.max_tokens,
      stream: true,
      ...(isMiniMax ? { reasoning_split: true } : {}), // For MiniMax reasoning models compatibility
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
  
  let reasoningBuffer = "";
  let textBuffer = "";
  let yieldedThinkStart = false;
  let yieldedThinkEnd = false;

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
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;

        // Handle reasoning details (MiniMax) or direct reasoning_content (DeepSeek)
        const hasReasoningArray = delta.reasoning_details && delta.reasoning_details.length > 0;
        const rawReasoningContent = delta.reasoning_content;
        
        if (hasReasoningArray || rawReasoningContent) {
          if (!yieldedThinkStart) {
            yield "<think>\n";
            yieldedThinkStart = true;
          }
          
          let newReasoning = "";
          if (hasReasoningArray) {
            const detail = delta.reasoning_details[0];
            if (detail && typeof detail.text === "string") {
              const rText = detail.text;
              newReasoning = isMiniMax ? rText.slice(reasoningBuffer.length) : rText;
              reasoningBuffer = isMiniMax ? rText : reasoningBuffer + rText;
            }
          } else if (rawReasoningContent) {
            newReasoning = rawReasoningContent;
          }
          
          if (newReasoning) yield newReasoning;
        }

        // Handle standard content
        if (typeof delta.content === "string" && delta.content.length > 0) {
          if (yieldedThinkStart && !yieldedThinkEnd) {
            yield "\n</think>\n\n";
            yieldedThinkEnd = true;
          }
          const cText = delta.content;
          const newText = isMiniMax ? cText.slice(textBuffer.length) : cText;
          if (newText) {
            yield newText;
            textBuffer = isMiniMax ? cText : textBuffer + cText;
          }
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }
  
  if (yieldedThinkStart && !yieldedThinkEnd) {
    yield "\n</think>\n\n";
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
