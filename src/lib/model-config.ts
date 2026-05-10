/**
 * model-config.ts — resolves the active Model<Api> for pi-ai from settings.json / env vars.
 *
 * Priority (highest → lowest):
 *   1. data/settings.json  (written by Settings UI)
 *   2. Built-in default: MiniMax OpenAI-compatible endpoint
 */
import fs from "fs";
import path from "path";
import type { Api, Model } from "@/lib/pi-ai/index";

export interface HeurisLLMSettings {
  provider?: string;   // e.g. "openai", "minimax", "ollama"
  baseUrl?: string;    // custom base URL
  apiKey?: string;
  model: string;       // model id string
}

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

// ─── Hardcoded defaults: MiniMax OpenAI-compatible ────────────────────────────
const DEFAULT_PROVIDER = "minimax";
const DEFAULT_BASE_URL = "https://api.minimax.chat/v1";
const DEFAULT_API_KEY = "sk-cp-pAA1BuMfXYyblLgGP9prg2zO2xUY69HPHhdekBbvwff9-qgRYfDVo-6QouXYTihJm1_ZYtSnipxJau12DQkpGtsdnpO0HDu0udvhBxMlb3N_G0ne6YUYHoo";
const DEFAULT_MODEL = "MiniMax-M1";

function readSettings(): HeurisLLMSettings {
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
    // fall through to defaults
  }

  return {
    provider: DEFAULT_PROVIDER,
    baseUrl: DEFAULT_BASE_URL,
    apiKey: DEFAULT_API_KEY,
    model: DEFAULT_MODEL,
  };
}

/**
 * Maps a provider name + baseUrl to a pi-ai Api type.
 * MiniMax and most providers use the OpenAI-completions compatible format.
 */
function resolveApi(provider?: string, _baseUrl?: string): Api {
  const normalized = (provider ?? "").toLowerCase();
  if (normalized === "anthropic") return "anthropic-messages";
  if (normalized === "google" || normalized === "gemini") return "google-generative-ai";
  if (normalized === "mistral") return "mistral-conversations";
  if (normalized === "openai-responses") return "openai-responses";
  // MiniMax, OpenAI, DeepSeek, Ollama, Coze — all use openai-completions
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
  if (p === "minimax") return DEFAULT_BASE_URL;
  // Default: MiniMax
  return DEFAULT_BASE_URL;
}

/**
 * Build a pi-ai Model<Api> from the current settings.
 */
export function getActiveModel(): Model<Api> {
  const settings = readSettings();
  const api = resolveApi(settings.provider, settings.baseUrl);
  const baseUrl = resolveBaseUrl(api, settings.provider, settings.baseUrl);

  return {
    id: settings.model,
    name: settings.model,
    api,
    provider: settings.provider ?? DEFAULT_PROVIDER,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 8_192,
    headers: undefined,
  } satisfies Model<Api>;
}

/**
 * Get the API key for the currently-configured provider.
 */
export function getActiveApiKey(): string {
  const settings = readSettings();
  return settings.apiKey || DEFAULT_API_KEY;
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
