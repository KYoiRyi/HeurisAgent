import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, RotateCcw, Activity, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import type { LlmHealth, SettingsValue } from "@/lib/api-types";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  { id: "minimax", label: "MiniMax", placeholder: "https://api.minimaxi.com/v1" },
  { id: "deepseek", label: "DeepSeek", placeholder: "https://api.deepseek.com/v1" },
  { id: "openai", label: "OpenAI 兼容", placeholder: "https://api.openai.com/v1" },
  { id: "ollama", label: "本地 Ollama", placeholder: "http://127.0.0.1:11434/v1" },
];

export default function SettingsRoute() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ provider: string; baseUrl: string; apiKey: string; model: string }>({
    provider: "minimax",
    baseUrl: "",
    apiKey: "",
    model: "",
  });
  const [revealKey, setRevealKey] = useState(false);

  const settingsQ = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsValue>("/settings"),
  });

  const healthQ = useQuery({
    queryKey: ["llm-health"],
    queryFn: () => api.get<LlmHealth>("/v1/health"),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (settingsQ.data) {
      setForm({
        provider: settingsQ.data.provider ?? "minimax",
        baseUrl: settingsQ.data.baseUrl ?? "",
        apiKey: "",
        model: settingsQ.data.model ?? "",
      });
    }
  }, [settingsQ.data]);

  const save = useMutation({
    mutationFn: (next: typeof form) => api.put<SettingsValue>("/settings", next),
    onSuccess: () => {
      toast.success("LLM 配置已保存");
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["llm-health"] });
    },
    onError: (err: unknown) => {
      const m = err instanceof Error ? err.message : "保存失败";
      toast.error(m);
    },
  });

  const reset = useMutation({
    mutationFn: () => api.post<SettingsValue>("/settings/reset"),
    onSuccess: () => {
      toast.success("已恢复默认 MiniMax 配置");
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["llm-health"] });
    },
  });

  const provider = useMemo(() => PROVIDERS.find((p) => p.id === form.provider) ?? PROVIDERS[0], [form.provider]);

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="caption-uppercase">模型配置</div>
        <h1 className="font-display-tight text-[44px] leading-[1.05] tracking-tight text-ink dark:text-on-dark md:text-[52px]">
          AI 设置
        </h1>
        <p className="max-w-2xl text-[15.5px] leading-[1.65] text-[var(--color-body)] dark:text-[var(--color-on-dark-soft)]">
          切换 LLM 提供商、模型与密钥。所有配置写入本地 PostgreSQL，重启自动恢复。
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-7 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
          <div className="space-y-1.5">
            <div className="caption-uppercase">模型提供商</div>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, provider: p.id }))}
                  className={cn(
                    "rounded-md border px-3 py-2 text-[12.5px] font-medium transition",
                    p.id === form.provider
                      ? "border-[var(--color-coral)] bg-[var(--color-coral)]/10 text-[var(--color-coral-active)]"
                      : "border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-body-strong)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="模型名称" hint="例如：MiniMax-M2.5-highspeed / qwen2.5">
            <input
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              placeholder="MiniMax-M2.5-highspeed"
              className="settings-input"
            />
          </Field>

          <Field label="接口地址" hint={`默认：${provider.placeholder}`}>
            <input
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder={provider.placeholder}
              className="settings-input"
            />
          </Field>

          <Field
            label="密钥"
            hint={
              settingsQ.data?.hasApiKey
                ? `已配置：${settingsQ.data.apiKeyMasked}（留空保存即保留现有密钥）`
                : "本地存储，不会发送给目标 LLM 之外的端点"
            }
          >
            <div className="flex gap-2">
              <input
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder={settingsQ.data?.hasApiKey ? "粘贴新密钥以替换 · 留空保留" : "sk-..."}
                type={revealKey ? "text" : "password"}
                className="settings-input flex-1 font-mono"
              />
              <button
                type="button"
                onClick={() => setRevealKey((v) => !v)}
                className="grid h-10 w-10 place-items-center rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]"
                title={revealKey ? "隐藏" : "显示输入"}
              >
                {revealKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {settingsQ.data?.hasApiKey && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#3a7a52]/30 bg-[#3a7a52]/8 px-2.5 py-0.5 text-[10.5px] font-medium text-[#3a7a52]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#3a7a52]" />
                密钥已持久化
              </div>
            )}
          </Field>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate(form)}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--color-coral)] px-5 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[var(--color-coral-active)] disabled:opacity-60"
            >
              <Save className="h-4 w-4" strokeWidth={2} />
              保存
            </button>
            <button
              type="button"
              disabled={reset.isPending}
              onClick={() => reset.mutate()}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-5 py-2.5 text-[13.5px] font-medium text-ink transition hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.10)] dark:bg-[var(--color-surface-dark-elev)] dark:text-on-dark"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2} />
              恢复默认
            </button>
          </div>
        </div>

        <HealthCard health={healthQ.data} loading={healthQ.isLoading} />
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="caption-uppercase">{label}</div>
      {children}
      {hint && <div className="text-[11.5px] text-[var(--color-muted)]">{hint}</div>}
    </div>
  );
}

function HealthCard({ health, loading }: { health?: LlmHealth; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-7 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
      <div className="flex items-center justify-between">
        <div className="caption-uppercase">连接状态</div>
        <Activity className="h-3.5 w-3.5 text-[var(--color-muted)]" strokeWidth={2} />
      </div>
      <div className="mt-4 space-y-3 text-[13.5px]">
        <Row k="状态" v={loading ? "检测中…" : health?.ok ? "在线" : "离线"} good={health?.ok} />
        <Row k="提供商" v={health?.provider ?? "—"} />
        <Row k="模型" v={health?.model ?? "—"} />
        <Row k="接口地址" v={health?.baseUrl ?? "—"} mono />
        {health?.error && <Row k="错误" v={health.error} bad />}
        {health?.models?.length ? (
          <div className="pt-2">
            <div className="caption-uppercase mb-1.5">可用模型</div>
            <div className="max-h-44 overflow-y-auto rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] p-2 font-mono text-[11.5px] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
              {health.models.map((m) => (
                <div key={m} className="truncate text-[var(--color-body-strong)] dark:text-[var(--color-on-dark-soft)]">
                  {m}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  good,
  bad,
  mono,
}: {
  k: string;
  v: string;
  good?: boolean;
  bad?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[var(--color-muted)]">{k}</span>
      <span
        className={cn(
          "min-w-0 break-all text-right",
          mono && "font-mono text-[12px]",
          good && "text-[#3a7a52] dark:text-[#9bd1a8]",
          bad && "text-[var(--color-coral-active)]",
          !good && !bad && "text-[var(--color-body-strong)] dark:text-on-dark",
        )}
      >
        {v}
      </span>
    </div>
  );
}
