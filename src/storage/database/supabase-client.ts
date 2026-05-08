/**
 * Supabase client factory.
 *
 * Reads credentials from environment variables.  When running locally without
 * a Supabase instance the variables may be absent; in that case
 * `getSupabaseClient()` returns `null` and callers must handle that gracefully
 * by using the Local SQLite environment instead.
 *
 * Supported env vars (set in .env.local):
 *   SUPABASE_URL              — your project URL
 *   SUPABASE_ANON_KEY         — anon / public key
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (optional, for backend writes)
 *
 * Legacy Coze-platform names are also accepted as fallbacks:
 *   COZE_SUPABASE_URL, COZE_SUPABASE_ANON_KEY, COZE_SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let envLoaded = false;

function loadEnv(): void {
  if (envLoaded) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config({ path: ".env.local" });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config(); // also load .env
  } catch {
    // dotenv not available in edge runtime — env vars must be set externally
  }
  envLoaded = true;
}

function resolveEnv(key: string, legacyKey?: string): string | undefined {
  return process.env[key] || (legacyKey ? process.env[legacyKey] : undefined);
}

interface SupabaseCredentials {
  url: string;
  key: string;
}

function getCredentials(): SupabaseCredentials | null {
  loadEnv();
  const url =
    resolveEnv("SUPABASE_URL", "COZE_SUPABASE_URL");
  const serviceKey =
    resolveEnv("SUPABASE_SERVICE_ROLE_KEY", "COZE_SUPABASE_SERVICE_ROLE_KEY");
  const anonKey =
    resolveEnv("SUPABASE_ANON_KEY", "COZE_SUPABASE_ANON_KEY");

  if (!url || (!serviceKey && !anonKey)) return null;
  return { url, key: serviceKey ?? anonKey! };
}

/**
 * Returns a Supabase client, or `null` when credentials are not configured.
 * All API routes should guard: `if (!client) return emptyFallback`.
 */
export function getSupabaseClient(_token?: string): SupabaseClient | null {
  const creds = getCredentials();
  if (!creds) return null;

  return createClient(creds.url, creds.key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/** @deprecated Use getSupabaseClient() — now returns null when unconfigured */
export function getSupabaseCredentials() {
  const creds = getCredentials();
  if (!creds) throw new Error("Supabase credentials not configured");
  return { url: creds.url, anonKey: creds.key };
}

export function isSupabaseConfigured(): boolean {
  return getCredentials() !== null;
}
