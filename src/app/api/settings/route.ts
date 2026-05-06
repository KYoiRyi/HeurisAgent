/**
 * /api/settings – Read & write the local LLM provider configuration.
 *
 * Settings are persisted in <project-root>/data/settings.json so they survive
 * server restarts without touching .env.local.
 *
 * GET  /api/settings          → returns current config (API key masked)
 * POST /api/settings          → save new config
 * POST /api/settings/test     → test connectivity to the configured backend
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

export interface LLMSettings {
  provider: string;       // "ollama" | "openai" | "deepseek" | "lmstudio" | "custom"
  baseUrl: string;
  apiKey: string;
  model: string;
  label?: string;         // display name for the provider
}

const DEFAULTS: LLMSettings = {
  provider: "ollama",
  baseUrl: process.env.LLM_BASE_URL || "http://localhost:11434/v1",
  apiKey: process.env.LLM_API_KEY || "ollama",
  model: process.env.LLM_MODEL || "qwen2.5:7b",
  label: "Ollama (本地)",
};

export function loadSettings(): LLMSettings {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore corrupt file
  }
  return DEFAULTS;
}

function saveSettings(settings: LLMSettings) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

// GET — return settings (mask API key)
export async function GET() {
  const settings = loadSettings();
  return NextResponse.json({
    success: true,
    data: {
      ...settings,
      apiKey: settings.apiKey ? "••••" + settings.apiKey.slice(-4) : "",
    },
  });
}

// POST — save settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "test") {
      // Test connectivity
      const { baseUrl, apiKey, model } = body;
      try {
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          return NextResponse.json({
            success: false,
            error: `HTTP ${res.status}: ${await res.text()}`,
          });
        }
        const data = await res.json();
        const models = (data.data ?? []).map((m: { id: string }) => m.id);

        // Also try a quick chat completion
        const chatRes = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || (models[0] ?? "gpt-3.5-turbo"),
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 5,
            stream: false,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!chatRes.ok) {
          return NextResponse.json({
            success: false,
            error: `Chat test failed: HTTP ${chatRes.status}`,
            models,
          });
        }

        return NextResponse.json({ success: true, models });
      } catch (err) {
        return NextResponse.json({
          success: false,
          error: String(err),
        });
      }
    }

    // Save settings
    const { provider, baseUrl, apiKey, model, label } = body;
    if (!baseUrl || !model) {
      return NextResponse.json(
        { error: "baseUrl and model are required" },
        { status: 400 }
      );
    }

    const current = loadSettings();
    const next: LLMSettings = {
      provider: provider || "custom",
      baseUrl,
      // If user sent back the masked key, keep the existing key
      apiKey: apiKey && !apiKey.startsWith("••••") ? apiKey : current.apiKey,
      model,
      label: label || provider || "Custom",
    };

    saveSettings(next);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
