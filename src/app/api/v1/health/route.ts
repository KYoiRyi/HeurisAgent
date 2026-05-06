/**
 * GET /api/v1/health
 * Returns health status of both the Next.js server and the LLM backend.
 */
import { NextResponse } from "next/server";
import { checkLLMHealth } from "@/lib/llm-client";
import { isSupabaseConfigured } from "@/storage/database/supabase-client";

export async function GET() {
  const llm = await checkLLMHealth();
  const dbConfigured = isSupabaseConfigured();

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      llm: {
        ok: llm.ok,
        baseUrl: process.env.LLM_BASE_URL || "http://localhost:11434/v1",
        model: process.env.LLM_MODEL || "qwen2.5:7b",
        availableModels: llm.models,
        error: llm.error,
      },
      database: {
        configured: dbConfigured,
        url: dbConfigured
          ? (process.env.SUPABASE_URL || process.env.COZE_SUPABASE_URL || "")
              .replace(/^(https?:\/\/[^.]+).*/, "$1…")
          : null,
      },
    },
  });
}
