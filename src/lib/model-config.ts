/**
 * model-config.ts — resolves the active Model<Api> for pi-ai from settings.json / env vars.
 *
 * Priority (highest → lowest):
 *   1. data/settings.json  (written by Settings UI)
 *   2. Environment variables: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_PROVIDER
 *   3. Built-in defaults (local Ollama via openai-completions)
 */
import fs from "fs";
import path from "path";
import type { Api, Model } from "@/lib/pi-ai/index";

export interface HeurisLLMSettings {
  provider?: string;   // e.g. "openai", "anthropic", "google", "ollama", "openrouter"
  baseUrl?: string;    // custom base URL (for Ollama or custom OpenAI-compat endpoints)
  apiKey?: string;
  model: string;       // model id string
}

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

function readSettings(): HeurisLLMSettings {
  // 1. Try settings.json
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
      const s = JSON.parse(raw);
      if (s.model || s.defaultModel) {
        return {
          provider: s.provider,
          baseUrl: s.baseUrl,
          apiKey: s.apiKey,
          model: s.model || s.defaultModel,
        };
      }
    }
  } catch {
    // fall through to env vars
  }

  // 2. Env vars
  return {
    provider: process.env.LLM_PROVIDER,
    baseUrl: process.env.LLM_BASE_URL || (process.env.COZE_API_KEY ? "https://api.coze.cn/v1" : undefined),
    apiKey: process.env.LLM_API_KEY || process.env.COZE_API_KEY,
    model: process.env.LLM_MODEL || "bot_id_placeholder",
  };
}

/**
 * Maps a provider name + baseUrl to a pi-ai Api type.
 * OpenAI-completions covers Ollama, OpenAI, DeepSeek, Groq, OpenRouter, etc.
 */
function resolveApi(provider?: string, baseUrl?: string): Api {
  if (!provider && baseUrl) {
    // Auto-detect from URL
    if (baseUrl.includes("anthropic")) return "anthropic-messages";
    if (baseUrl.includes("googleapis") || baseUrl.includes("generativelanguage")) return "google-generative-ai";
    if (baseUrl.includes("mistral")) return "mistral-conversations";
    return "openai-completions";
  }

  const normalized = (provider ?? "").toLowerCase();
  if (normalized === "anthropic") return "anthropic-messages";
  if (normalized === "google" || normalized === "gemini") return "google-generative-ai";
  if (normalized === "mistral") return "mistral-conversations";
  if (normalized === "openai-responses") return "openai-responses";
  // For Coze and everything else (openai, deepseek, groq, openrouter, etc.) use openai-completions
  return "openai-completions";
}

/**
 * Returns the resolved base URL for the provider.
 */
function resolveBaseUrl(api: Api, provider?: string, customBaseUrl?: string): string {
  if (customBaseUrl) return customBaseUrl.replace(/\/$/, "");

  const p = (provider ?? "").toLowerCase();
  if (api === "anthropic-messages") return "https://api.anthropic.com";
  if (api === "google-generative-ai") return "https://generativelanguage.googleapis.com/v1beta";
  if (api === "mistral-conversations") return "https://api.mistral.ai";
  if (p === "deepseek") return "https://api.deepseek.com/v1";
  if (p === "groq") return "https://api.groq.com/openai/v1";
  if (p === "openrouter") return "https://openrouter.ai/api/v1";
  if (p === "openai") return "https://api.openai.com/v1";
  if (p === "coze") return "https://api.coze.cn/v1";
  // Default: local Ollama fallback if nothing is configured
  return "http://localhost:11434/v1";
}

/**
 * Build a pi-ai Model<Api> from the current settings.
 * Returns a "dynamic" model definition that works with openai-completions
 * even for unknown model IDs (Ollama local models, custom endpoints).
 */
export function getActiveModel(): Model<Api> {
  const settings = readSettings();
  const api = resolveApi(settings.provider, settings.baseUrl);
  const baseUrl = resolveBaseUrl(api, settings.provider, settings.baseUrl);

  return {
    id: settings.model,
    name: settings.model,
    api,
    provider: settings.provider ?? (baseUrl.includes("localhost") ? "ollama" : "custom"),
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
    headers: settings.apiKey ? undefined : undefined,
  } satisfies Model<Api>;
}

/**
 * Get the API key for the currently-configured provider.
 */
export function getActiveApiKey(): string {
  const settings = readSettings();
  return settings.apiKey || "ollama";
}

/**
 * Returns the full current settings (for health checks, UI display, etc.)
 */
export function getCurrentSettings(): HeurisLLMSettings & { resolvedBaseUrl: string; resolvedApi: Api } {
  const settings = readSettings();
  const api = resolveApi(settings.provider, settings.baseUrl);
  const baseUrl = resolveBaseUrl(api, settings.provider, settings.baseUrl);
  return { ...settings, resolvedBaseUrl: baseUrl, resolvedApi: api };
}
