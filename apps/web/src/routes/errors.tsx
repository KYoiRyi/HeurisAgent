import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Trash2, BookOpen, Filter, Sparkles, Loader2, Layers } from "lucide-react";
import { api } from "@/lib/api";
import type { ErrorListResponse, ErrorQuestion, ErrorStats } from "@/lib/api-types";
import { cn } from "@/lib/utils";

const ERROR_TYPES: Record<string, string> = {
  concept: "概念",
  calculation: "计算",
  careless: "粗心",
  method: "方法",
  unknown: "未分类",
};

export default function ErrorsRoute() {
  const qc = useQueryClient();
  const [errorType, setErrorType] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "mastered">("all");
  const [subject, setSubject] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["errors", { errorType, statusFilter, subject }],
    queryFn: () => {
      const p = new URLSearchParams({ limit: "60" });
      if (errorType !== "all") p.set("errorType", errorType);
      if (statusFilter === "pending") p.set("status", "pending");
      if (subject.trim()) p.set("subject", subject.trim());
      return api.get<ErrorListResponse>(`/errors?${p.toString()}`);
    },
  });

  const statsQ = useQuery({
    queryKey: ["errors-stats", { subject }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (subject.trim()) p.set("subject", subject.trim());
      const qs = p.toString();
      return api.get<ErrorStats>(`/errors/stats${qs ? `?${qs}` : ""}`);
    },
  });

  const toggleMastered = useMutation({
    mutationFn: (e: ErrorQuestion) =>
      api.patch<ErrorQuestion>(`/errors/${e.id}`, {
        mastered: !e.mastered,
        status: !e.mastered ? "mastered" : "pending",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["errors"] });
      qc.invalidateQueries({ queryKey: ["errors-stats"] });
    },
  });

  const deleteE = useMutation({
    mutationFn: (id: string) => api.delete(`/errors/${id}`),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["errors"] });
      qc.invalidateQueries({ queryKey: ["errors-stats"] });
    },
  });

  const generateVariants = useMutation({
    mutationFn: (vars: { id: string; count: number }) =>
      api.post<ErrorQuestion>(`/errors/${vars.id}/variants`, { count: vars.count }),
    onSuccess: (updated) => {
      toast.success(`已生成 ${(updated.similar_questions ?? []).length} 道变形题`);
      qc.invalidateQueries({ queryKey: ["errors"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "生成失败"),
  });

  const items = useMemo(() => {
    const all = listQ.data?.items ?? [];
    if (statusFilter === "mastered") return all.filter((e) => e.mastered);
    if (statusFilter === "pending") return all.filter((e) => !e.mastered);
    return all;
  }, [listQ.data, statusFilter]);

  const selected = items.find((e) => e.id === selectedId) ?? items[0] ?? null;
  const stats = statsQ.data;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="caption-uppercase">Error questions</div>
        <h1 className="font-display-tight text-[44px] leading-[1.05] tracking-tight text-ink dark:text-on-dark md:text-[52px]">
          错题管理
        </h1>
        <p className="max-w-2xl text-[15.5px] leading-[1.65] text-[var(--color-body)] dark:text-[var(--color-on-dark-soft)]">
          错因分类（concept / calculation / careless / method）、薄弱点画像、同类变形与强化建议。
        </p>
      </header>

      {stats && (
        <section className="grid gap-3 md:grid-cols-4">
          <StatCard label="总错题" value={stats.total.toString()} hint={`已掌握 ${stats.mastered}`} />
          {stats.byType.slice(0, 3).map((t) => (
            <StatCard
              key={t.errorType}
              label={ERROR_TYPES[t.errorType] ?? t.errorType}
              value={t.count.toString()}
              hint={`${stats.total ? Math.round((t.count / stats.total) * 100) : 0}%`}
            />
          ))}
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={errorType === "all"} onClick={() => setErrorType("all")}>
            全部
          </FilterChip>
          {Object.entries(ERROR_TYPES).map(([k, label]) =>
            k === "unknown" ? null : (
              <FilterChip key={k} active={errorType === k} onClick={() => setErrorType(k)}>
                {label}
              </FilterChip>
            ),
          )}
          <span className="mx-2 h-4 w-px bg-[var(--color-hairline)] dark:bg-[rgba(250,249,245,0.08)]" />
          {(["all", "pending", "mastered"] as const).map((s) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s === "all" ? "全部状态" : s === "pending" ? "待复盘" : "已掌握"}
            </FilterChip>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-[var(--color-muted)]" strokeWidth={2} />
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="按学科筛选"
              className="settings-input h-9 max-w-[160px]"
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-3">
            <div className="caption-uppercase">
              {listQ.isLoading ? "加载中…" : `${items.length} 条错题`}
            </div>
            {items.length === 0 && !listQ.isLoading && (
              <div className="rounded-lg border border-dashed border-[var(--color-hairline)] p-10 text-center text-[13.5px] text-[var(--color-muted)] dark:border-[rgba(250,249,245,0.08)]">
                暂无错题。课堂智能体的 <code className="font-mono text-[12px]">save_error_question</code> 工具会自动写入这里。
              </div>
            )}
            {items.map((e) => (
              <ErrorRow
                key={e.id}
                item={e}
                active={selected?.id === e.id}
                onClick={() => setSelectedId(e.id)}
                onToggleMastered={() => toggleMastered.mutate(e)}
                onDelete={() => deleteE.mutate(e.id)}
              />
            ))}
          </div>

          <div>
            {selected ? (
              <ErrorDetail
                item={selected}
                onGenerateVariants={(count) => generateVariants.mutate({ id: selected.id, count })}
                generating={generateVariants.isPending && generateVariants.variables?.id === selected.id}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--color-hairline)] p-12 text-center text-[14px] text-[var(--color-muted)] dark:border-[rgba(250,249,245,0.08)]">
                选择左侧的错题查看错因分析与同类变形。
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-5 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
      <div className="caption-uppercase text-[10px]">{label}</div>
      <div className="mt-1.5 font-display text-[28px] leading-tight tracking-tight text-ink dark:text-on-dark">{value}</div>
      <div className="mt-0.5 text-[11.5px] text-[var(--color-muted)]">{hint}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition",
        active
          ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white dark:border-[var(--color-on-dark)] dark:bg-[var(--color-on-dark)] dark:text-[var(--color-ink)]"
          : "border-[var(--color-hairline)] text-[var(--color-body)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]",
      )}
    >
      {children}
    </button>
  );
}

function ErrorRow({
  item,
  active,
  onClick,
  onToggleMastered,
  onDelete,
}: {
  item: ErrorQuestion;
  active: boolean;
  onClick: () => void;
  onToggleMastered: () => void;
  onDelete: () => void;
}) {
  const typeLabel = ERROR_TYPES[item.error_type ?? "unknown"] ?? item.error_type ?? "未分类";
  return (
    <div
      role="button"
      onClick={onClick}
      className={cn(
        "group cursor-pointer rounded-lg border p-4 transition",
        active
          ? "border-[var(--color-coral)] bg-[var(--color-coral)]/5"
          : "border-[var(--color-hairline)] bg-[var(--color-canvas)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)] dark:hover:bg-[var(--color-surface-dark-soft)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="caption-uppercase text-[10px]">{item.subject} · {item.student_name}</span>
          <span className="rounded-full bg-[var(--color-coral)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-coral-active)]">
            {typeLabel}
          </span>
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMastered();
            }}
            title={item.mastered ? "标记为待复盘" : "标记为已掌握"}
            className={cn(
              "grid h-6 w-6 place-items-center rounded-md border transition",
              item.mastered
                ? "border-[#3a7a52] bg-[#3a7a52]/10 text-[#3a7a52]"
                : "border-[var(--color-hairline)] text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]",
            )}
          >
            <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="grid h-6 w-6 place-items-center rounded-md border border-[var(--color-hairline)] text-[var(--color-muted)] transition hover:bg-[#fef0eb] hover:text-[var(--color-coral-active)] dark:border-[rgba(250,249,245,0.08)]"
          >
            <Trash2 className="h-3 w-3" strokeWidth={2} />
          </button>
        </div>
      </div>
      <p className="mt-2 line-clamp-3 text-[13.5px] leading-[1.6] text-[var(--color-body-strong)] dark:text-[var(--color-on-dark-soft)]">
        {item.question_text}
      </p>
      <div className="mt-2 flex items-center gap-2 text-[10.5px] text-[var(--color-muted)]">
        <span>{new Date(item.created_at).toLocaleString("zh-CN", { hour12: false })}</span>
        {item.mastered && <span className="text-[#3a7a52]">· 已掌握</span>}
        {!item.mastered && item.review_count > 0 && <span>· 复习 {item.review_count} 次</span>}
      </div>
    </div>
  );
}

function ErrorDetail({
  item,
  onGenerateVariants,
  generating,
}: {
  item: ErrorQuestion;
  onGenerateVariants: (count: number) => void;
  generating: boolean;
}) {
  const typeLabel = ERROR_TYPES[item.error_type ?? "unknown"] ?? item.error_type ?? "未分类";
  const variants = (item.similar_questions ?? []) as Array<{
    question_text?: string;
    difficulty?: string;
    knowledge_points?: string[];
    hint?: string;
    answer?: string;
  }>;
  return (
    <div className="space-y-6 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-7 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="caption-uppercase">{item.subject} · {item.student_name}</span>
          <span className="rounded-full bg-[var(--color-coral)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-coral-active)]">
            {typeLabel}
          </span>
          {item.mastered && (
            <span className="rounded-full bg-[#3a7a52]/10 px-2 py-0.5 text-[11px] font-medium text-[#3a7a52]">
              已掌握
            </span>
          )}
        </div>
        <h2 className="font-display text-[22px] leading-tight tracking-tight text-ink dark:text-on-dark whitespace-pre-wrap">
          {item.question_text}
        </h2>
      </div>

      {item.student_answer && (
        <Section icon={AlertCircle} title="学生答案">
          <pre className="whitespace-pre-wrap text-[13.5px] leading-[1.7] text-[var(--color-body-strong)] dark:text-[var(--color-on-dark-soft)]">
            {item.student_answer}
          </pre>
        </Section>
      )}

      {item.correct_answer && (
        <Section icon={CheckCircle2} title="参考答案">
          <pre className="whitespace-pre-wrap text-[13.5px] leading-[1.7] text-[var(--color-body-strong)] dark:text-[var(--color-on-dark-soft)]">
            {item.correct_answer}
          </pre>
        </Section>
      )}

      {item.error_analysis && (
        <Section icon={AlertCircle} title="错因分析">
          <pre className="whitespace-pre-wrap text-[13.5px] leading-[1.7] text-[var(--color-body-strong)] dark:text-[var(--color-on-dark-soft)]">
            {item.error_analysis}
          </pre>
        </Section>
      )}

      {item.reinforcement_suggestions && (
        <Section icon={BookOpen} title="强化建议">
          <pre className="whitespace-pre-wrap text-[13.5px] leading-[1.7] text-[var(--color-body-strong)] dark:text-[var(--color-on-dark-soft)]">
            {item.reinforcement_suggestions}
          </pre>
        </Section>
      )}

      {item.knowledge_points.length > 0 && (
        <Section icon={BookOpen} title="相关知识点">
          <div className="flex flex-wrap gap-1.5">
            {item.knowledge_points.map((k) => (
              <span
                key={k}
                className="rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-2.5 py-1 text-[11.5px] text-[var(--color-body)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]"
              >
                {k}
              </span>
            ))}
          </div>
        </Section>
      )}

      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-[var(--color-muted)]" strokeWidth={2} />
            <div className="caption-uppercase">同类变形 ({variants.length})</div>
          </div>
          <button
            type="button"
            disabled={generating}
            onClick={() => onGenerateVariants(3)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-1.5 text-[12px] font-medium text-ink transition hover:bg-[var(--color-surface-soft)] disabled:opacity-60 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)] dark:text-on-dark"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />}
            {generating ? "生成中…" : variants.length > 0 ? "重新生成" : "生成变形题"}
          </button>
        </div>
        {variants.length > 0 ? (
          <ol className="space-y-3">
            {variants.map((v, i) => (
              <li
                key={i}
                className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] p-4 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--color-ink)] text-[10px] font-medium text-white dark:bg-[var(--color-on-dark)] dark:text-[var(--color-ink)]">
                    {i + 1}
                  </span>
                  {v.difficulty && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        v.difficulty === "hard"
                          ? "bg-[var(--color-coral)]/15 text-[var(--color-coral-active)]"
                          : v.difficulty === "easy"
                            ? "bg-[#3a7a52]/10 text-[#3a7a52]"
                            : "bg-[var(--color-surface-card)] text-[var(--color-muted)]",
                      )}
                    >
                      {v.difficulty}
                    </span>
                  )}
                </div>
                {v.question_text && (
                  <div className="mt-2 text-[13.5px] leading-[1.65] text-[var(--color-body-strong)] dark:text-on-dark whitespace-pre-wrap">
                    {v.question_text}
                  </div>
                )}
                {v.hint && (
                  <div className="mt-2 text-[12px] leading-[1.6] text-[var(--color-muted)]">
                    提示：{v.hint}
                  </div>
                )}
                {v.answer && (
                  <details className="mt-2 group">
                    <summary className="cursor-pointer text-[12px] text-[var(--color-coral-active)] hover:underline">
                      查看参考答案
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap rounded bg-[var(--color-canvas)] p-2 text-[12.5px] leading-[1.6] text-[var(--color-body-strong)] dark:bg-[var(--color-surface-dark-elev)] dark:text-[var(--color-on-dark-soft)]">
                      {v.answer}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--color-hairline)] p-6 text-center text-[12.5px] text-[var(--color-muted)] dark:border-[rgba(250,249,245,0.08)]">
            点击「生成变形题」让 LLM 基于这道错题的薄弱点出 3 道同类题。
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof AlertCircle;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] p-4 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-[var(--color-muted)]" strokeWidth={2} />
        <div className="caption-uppercase">{title}</div>
      </div>
      {children}
    </div>
  );
}
