import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB } from "@/persistence/persistence.module";
import type { Database } from "@/persistence/database";
import { appSettings } from "@/persistence/schema";
import type { Api, Model } from "@/llm/pi-ai/index";

export interface HeurisLLMSettings {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
}

const SETTINGS_KEY = "active_llm";

const DEFAULT_PROVIDER = "minimax";
const DEFAULT_BASE_URL = "https://api.minimaxi.com/v1";
const DEFAULT_API_KEY =
  "sk-cp-pAA1BuMfXYyblLgGP9prg2zO2xUY69HPHhdekBbvwff9-qgRYfDVo-6QouXYTihJm1_ZYtSnipxJau12DQkpGtsdnpO0HDu0udvhBxMlb3N_G0ne6YUYHoo";
const DEFAULT_MODEL = "MiniMax-M2.5-highspeed";

const DEFAULT_SETTINGS: HeurisLLMSettings = {
  provider: DEFAULT_PROVIDER,
  baseUrl: DEFAULT_BASE_URL,
  apiKey: DEFAULT_API_KEY,
  model: DEFAULT_MODEL,
};

@Injectable()
export class SettingsService implements OnModuleInit {
  private cached: HeurisLLMSettings = DEFAULT_SETTINGS;

  constructor(@Inject(DB) private readonly db: Database) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<HeurisLLMSettings> {
    const [row] = await this.db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, SETTINGS_KEY))
      .limit(1);

    if (row && row.value && typeof row.value === "object") {
      const v = row.value as Partial<HeurisLLMSettings> & { defaultModel?: string };
      const model = v.model ?? v.defaultModel;
      if (model) {
        this.cached = {
          provider: v.provider,
          baseUrl: v.baseUrl,
          apiKey: v.apiKey,
          model,
        };
        return this.cached;
      }
    }

    this.cached = { ...DEFAULT_SETTINGS };
    return this.cached;
  }

  async get(): Promise<
    HeurisLLMSettings & {
      resolvedBaseUrl: string;
      resolvedApi: Api;
      hasApiKey: boolean;
      apiKeyMasked: string;
    }
  > {
    const settings = await this.refresh();
    const api = resolveApi(settings.provider);
    const baseUrl = resolveBaseUrl(api, settings.provider, settings.baseUrl);
    return {
      ...settings,
      resolvedBaseUrl: baseUrl,
      resolvedApi: api,
      hasApiKey: Boolean(settings.apiKey?.trim()),
      apiKeyMasked: maskKey(settings.apiKey),
    };
  }

  async update(input: Partial<HeurisLLMSettings>): Promise<HeurisLLMSettings> {
    const current = await this.refresh();
    const next: HeurisLLMSettings = {
      provider: input.provider ?? current.provider,
      baseUrl: input.baseUrl ?? current.baseUrl,
      // empty string means "don't change"; preserves existing key when the user
      // leaves the input blank in the UI
      apiKey:
        typeof input.apiKey === "string" && input.apiKey.length === 0
          ? current.apiKey
          : input.apiKey ?? current.apiKey,
      model: input.model ?? current.model,
    };

    await this.db
      .insert(appSettings)
      .values({ key: SETTINGS_KEY, value: next })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: next, updatedAt: new Date() },
      });

    this.cached = next;
    return next;
  }

  async reset(): Promise<HeurisLLMSettings> {
    await this.db.delete(appSettings).where(eq(appSettings.key, SETTINGS_KEY));
    this.cached = { ...DEFAULT_SETTINGS };
    return this.cached;
  }

  getActiveModel(): Model<Api> {
    const settings = this.cached;
    const api = resolveApi(settings.provider);
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

  getActiveApiKey(): string {
    return this.cached.apiKey || DEFAULT_API_KEY;
  }
}

function resolveApi(provider?: string): Api {
  const normalized = (provider ?? "").toLowerCase();
  if (normalized === "anthropic") return "anthropic-messages";
  if (normalized === "google" || normalized === "gemini") return "google-generative-ai";
  if (normalized === "mistral") return "mistral-conversations";
  if (normalized === "openai-responses") return "openai-responses";
  return "openai-completions";
}

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
  return DEFAULT_BASE_URL;
}

function maskKey(key?: string): string {
  const k = (key ?? "").trim();
  if (!k) return "";
  if (k.length <= 8) return "•".repeat(k.length);
  return `${k.slice(0, 4)}${"•".repeat(Math.min(12, k.length - 8))}${k.slice(-4)}`;
}
