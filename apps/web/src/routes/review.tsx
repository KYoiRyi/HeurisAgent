import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calendar, CheckCircle2, Target, Clock, ChevronRight, Sparkles, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { ReviewListResponse, ReviewPlan } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";

const SUBJECTS = ["全部", "数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "通用"];

export default function ReviewRoute() {
  const qc = useQueryClient();
  const [subject, setSubject] = useState("全部");
  const [statusFilter, setStatusFilter] = useState<"active" | "completed" | "all">("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const listQ = useQuery({
    queryKey: ["review", { statusFilter, subject }],
    queryFn: () => {
      const p = new URLSearchParams({ limit: "30" });
      if (statusFilter !== "all") p.set("status", statusFilter);
      if (subject !== "全部") p.set("subject", subject);
      return api.get<ReviewListResponse>(`/review?${p.toString()}`);
    },
  });

  const updatePlan = useMutation({
    mutationFn: (vars: { id: string; completed: number }) =>
      api.patch<ReviewPlan>(`/review/${vars.id}`, { completed_tasks: vars.completed }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review"] });
    },
  });

  const items = listQ.data?.items ?? [];
  const selected = items.find((p) => p.id === selectedId) ?? items[0];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="caption-uppercase">Review strategy</div>
          <h1 className="font-display-tight text-[44px] leading-[1.05] tracking-tight text-ink dark:text-on-dark md:text-[52px]">
            复习策略
          </h1>
          <p className="max-w-2xl text-[15.5px] leading-[1.65] text-[var(--color-body)] dark:text-[var(--color-on-dark-soft)]">
            基于错题密度与最近练习生成节奏化任务，跟踪进度并反馈给下一轮规划。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setGenerating(true)}
          className="inline-flex items-center gap-2 self-start rounded-md bg-[var(--color-coral)] px-4 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[var(--color-coral-active)] md:self-auto"
        >
          <Sparkles className="h-4 w-4" strokeWidth={2} />
          生成新计划
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="settings-input h-9 max-w-[110px]"
        >
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {(["active", "completed", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition",
              statusFilter === s
                ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white dark:border-[var(--color-on-dark)] dark:bg-[var(--color-on-dark)] dark:text-[var(--color-ink)]"
                : "border-[var(--color-hairline)] text-[var(--color-body)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]",
            )}
          >
            {s === "active" ? "进行中" : s === "completed" ? "已完成" : "全部"}
          </button>
        ))}
      </div>

      <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-3">
          <div className="caption-uppercase">
            {listQ.isLoading ? "加载中…" : `${items.length} 个计划`}
          </div>
          {items.length === 0 && !listQ.isLoading && (
            <div className="rounded-lg border border-dashed border-[var(--color-hairline)] p-8 text-center text-[13.5px] text-[var(--color-muted)] dark:border-[rgba(250,249,245,0.08)]">
              暂无复习计划。让复习智能体生成第一个吧。
            </div>
          )}
          {items.map((p) => (
            <PlanRow
              key={p.id}
              plan={p}
              active={selected?.id === p.id}
              onClick={() => setSelectedId(p.id)}
            />
          ))}
        </div>

        <div>
          {selected ? (
            <PlanDetail
              plan={selected}
              onCompleteTask={(n) => updatePlan.mutate({ id: selected.id, completed: n })}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--color-hairline)] p-12 text-center text-[14px] text-[var(--color-muted)] dark:border-[rgba(250,249,245,0.08)]">
              选择左侧的复习计划查看详情。
            </div>
          )}
        </div>
      </section>

      {generating && (
        <GenerateModal
          defaultSubject={subject !== "全部" ? subject : "数学"}
          onClose={() => setGenerating(false)}
          onGenerated={(plan) => {
            setGenerating(false);
            setSelectedId(plan.id);
            qc.invalidateQueries({ queryKey: ["review"] });
            toast.success(`已生成「${plan.plan_title}」`);
          }}
        />
      )}
    </div>
  );
}

function GenerateModal({
  defaultSubject,
  onClose,
  onGenerated,
}: {
  defaultSubject: string;
  onClose: () => void;
  onGenerated: (plan: ReviewPlan) => void;
}) {
  const [form, setForm] = useState({
    studentName: "",
    subject: defaultSubject,
    durationDays: 7,
    notes: "",
  });

  const generate = useMutation({
    mutationFn: () =>
      api.post<ReviewPlan>("/review/generate", {
        studentName: form.studentName.trim() || undefined,
        subject: form.subject.trim(),
        durationDays: form.durationDays,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: (plan) => onGenerated(plan),
    onError: (err) => toast.error(err instanceof Error ? err.message : "生成失败"),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg space-y-4 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-6 shadow-2xl dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="caption-uppercase">Review planner</div>
            <h2 className="font-display text-[22px] tracking-tight text-ink dark:text-on-dark">生成新计划</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--color-surface-soft)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[12.5px] leading-[1.6] text-[var(--color-muted)]">
          基于该学科的错题画像与记忆上下文，让 LLM 起草节奏化的复习计划。已经存在的活动计划会被自动归档。
        </p>
        <div className="grid grid-cols-2 gap-3">
          <input
            value={form.studentName}
            onChange={(e) => setForm({ ...form, studentName: e.target.value })}
            placeholder="学生姓名（可选）"
            className="settings-input"
          />
          <select
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="settings-input"
          >
            {SUBJECTS.filter((s) => s !== "全部").map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="col-span-2 flex items-center gap-3">
            <span className="text-[12.5px] text-[var(--color-muted)]">周期</span>
            {[3, 5, 7, 10, 14].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setForm({ ...form, durationDays: d })}
                className={cn(
                  "h-8 w-12 rounded-md border text-[12px] font-medium transition",
                  form.durationDays === d
                    ? "border-[var(--color-coral)] bg-[var(--color-coral)]/10 text-[var(--color-coral-active)]"
                    : "border-[var(--color-hairline)] text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]",
                )}
              >
                {d} 天
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="附加说明（可选，例如：临近考试，重点复习函数与几何）"
          className="settings-input min-h-[80px] resize-y py-2.5 leading-relaxed"
        />
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-hairline)] px-4 py-2 text-[13px] font-medium text-[var(--color-body)] transition hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!form.subject.trim() || generate.isPending}
            onClick={() => generate.mutate()}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-coral)] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[var(--color-coral-active)] disabled:opacity-60"
          >
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" strokeWidth={2} />}
            {generate.isPending ? "智能体起草中…" : "开始生成"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanRow({
  plan,
  active,
  onClick,
}: {
  plan: ReviewPlan;
  active: boolean;
  onClick: () => void;
}) {
  const pct = plan.total_tasks > 0 ? Math.round((plan.completed_tasks / plan.total_tasks) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group block w-full rounded-lg border p-4 text-left transition",
        active
          ? "border-[var(--color-coral)] bg-[var(--color-coral)]/5"
          : "border-[var(--color-hairline)] bg-[var(--color-canvas)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)] dark:hover:bg-[var(--color-surface-dark-soft)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="caption-uppercase text-[10px]">{plan.subject}</span>
        <span className={cn("text-[10px]", plan.status === "active" ? "text-[#3a7a52]" : "text-[var(--color-muted)]")}>
          {plan.status === "active" ? "进行中" : plan.status}
        </span>
      </div>
      <div className="mt-1.5 line-clamp-2 font-display text-[16px] leading-tight text-ink dark:text-on-dark">
        {plan.plan_title}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11.5px] text-[var(--color-muted)]">
        <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
        {plan.completed_tasks}/{plan.total_tasks}
        <div className="ml-auto flex items-center gap-1">
          <div className="relative h-1 w-12 overflow-hidden rounded-full bg-[var(--color-surface-soft)] dark:bg-[var(--color-surface-dark-soft)]">
            <div
              className="absolute inset-y-0 left-0 bg-[var(--color-coral)] transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="tabular-nums">{pct}%</span>
        </div>
      </div>
    </button>
  );
}

function PlanDetail({
  plan,
  onCompleteTask,
}: {
  plan: ReviewPlan;
  onCompleteTask: (n: number) => void;
}) {
  const pct = plan.total_tasks > 0 ? Math.round((plan.completed_tasks / plan.total_tasks) * 100) : 0;

  return (
    <div className="space-y-6 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-7 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
      <div className="space-y-2">
        <div className="caption-uppercase">{plan.subject} · {plan.student_name}</div>
        <h2 className="font-display-tight text-[28px] leading-tight tracking-tight text-ink dark:text-on-dark">
          {plan.plan_title}
        </h2>
        {plan.review_strategy && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-[1.7]">
            <Markdown>{plan.review_strategy}</Markdown>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat icon={Target} label="盲点" value={plan.blind_spots.length.toString()} hint={plan.blind_spots[0] ?? "—"} />
        <Stat icon={Clock} label="进度" value={`${pct}%`} hint={`${plan.completed_tasks}/${plan.total_tasks} 任务`} />
        <Stat icon={Calendar} label="创建" value={new Date(plan.created_at).toLocaleDateString("zh-CN")} hint={plan.status} />
      </div>

      {plan.priority_topics.length > 0 && (
        <Section title="优先复习主题">
          <ul className="space-y-2">
            {plan.priority_topics.map((t, i) => (
              <li key={i} className="flex items-start gap-3 rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] p-3 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    t.priority === "high" || t.priority === "高"
                      ? "bg-[var(--color-coral)]/15 text-[var(--color-coral-active)]"
                      : "bg-[var(--color-surface-card)] text-[var(--color-muted)]",
                  )}
                >
                  {t.priority}
                </span>
                <div>
                  <div className="text-[13.5px] font-medium text-ink dark:text-on-dark">{t.topic}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--color-muted)]">{t.reason}</div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {plan.schedule.length > 0 && (
        <Section title="任务排程">
          <ol className="space-y-2">
            {plan.schedule.map((day, i) => {
              const done = i < plan.completed_tasks;
              return (
                <li
                  key={i}
                  className={cn(
                    "group flex items-start gap-3 rounded-md border p-3 transition",
                    done
                      ? "border-[var(--color-hairline)] bg-[var(--color-surface-soft)] opacity-70 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]"
                      : "border-[var(--color-hairline)] bg-[var(--color-canvas)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onCompleteTask(done ? i : i + 1)}
                    className={cn(
                      "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition",
                      done
                        ? "border-[var(--color-coral)] bg-[var(--color-coral)] text-white"
                        : "border-[var(--color-hairline)] hover:border-[var(--color-coral)]",
                    )}
                  >
                    {done && <CheckCircle2 className="h-3 w-3" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="caption-uppercase text-[10px]">
                      {day.day} · {day.duration_minutes} 分钟
                    </div>
                    <ul className="mt-1 space-y-0.5 text-[13px] leading-[1.6] text-[var(--color-body-strong)] dark:text-[var(--color-on-dark-soft)]">
                      {day.tasks.map((t, j) => (
                        <li key={j} className="flex items-start gap-1.5">
                          <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-[var(--color-muted)]" strokeWidth={2} />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      {plan.plan_content && (
        <Section title="完整方案">
          <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] p-4 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
            <Markdown>{plan.plan_content}</Markdown>
          </div>
        </Section>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] p-4 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
      <div className="flex items-center justify-between">
        <div className="caption-uppercase text-[10px]">{label}</div>
        <Icon className="h-3.5 w-3.5 text-[var(--color-muted)]" strokeWidth={2} />
      </div>
      <div className="mt-2 font-display text-[22px] leading-tight tracking-tight text-ink dark:text-on-dark">{value}</div>
      <div className="mt-0.5 truncate text-[11.5px] text-[var(--color-muted)]">{hint}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="caption-uppercase mb-2.5">{title}</div>
      {children}
    </div>
  );
}
