/**
 * Thin REST + SSE client for the HeurisAgent API.
 *
 * The Vite dev server proxies `/api` and `/health` to Nest at 5001, and in
 * production the same paths are served by Nest itself, so we can always use
 * relative URLs.
 */
const BASE = "/api";

export interface ApiError extends Error {
  status?: number;
  payload?: unknown;
}

async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    ...init,
  });

  if (res.status === 204) return undefined as T;

  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();

  let parsed: unknown = text;
  if (ct.includes("application/json") && text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const err = new Error(
      `API ${method} ${path} failed: ${res.status} ${extractMessage(parsed) ?? ""}`.trim(),
    ) as ApiError;
    err.status = res.status;
    err.payload = parsed;
    throw err;
  }

  return parsed as T;
}

function extractMessage(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload.slice(0, 200);
  if (typeof payload === "object") {
    const m = (payload as { message?: unknown }).message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m.join("; ");
  }
  return null;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/**
 * Subscribe to a Nest @Sse() endpoint. Returns an unsubscribe function.
 *
 * Nest's @Sse() controllers always send `data: <json>\n\n`, so this thin
 * EventSource wrapper is enough for our agent event stream and any future
 * server-pushed feeds.
 */
export function subscribeSse<T = unknown>(
  path: string,
  onMessage: (event: T) => void,
  onError?: (event: Event) => void,
): () => void {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const source = new EventSource(url);
  source.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data) as T);
    } catch {
      onMessage(event.data as unknown as T);
    }
  };
  if (onError) source.onerror = onError;
  return () => source.close();
}
