import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BookX,
  CalendarClock,
  MessageSquareText,
  TrendingUp,
  Target,
  Flame,
  Award,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ErrorListResponse, ReviewListResponse, ResourceListResponse } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { Progress } from "@/components/ui/progress";

export default function DashboardRoute() {
  const errorsQ = useQuery({
    queryKey: ["dashboard-errors"],
    queryFn: () => api.get<ErrorListResponse>("/errors?limit=100"),
    refetchInterval: 30_000,
  });
  const reviewQ = useQuery({
    queryKey: ["dashboard-review"],
    queryFn: () => api.get<ReviewListResponse>("/review?status=active&limit=10"),
    refetchInterval: 30_000,
  });
  const resourcesQ = useQuery({
    queryKey: ["dashboard-resources"],
    queryFn: () => api.get<ResourceListResponse>("/resources?limit=100"),
    refetchInterval: 30_000,
  });

  const errors = errorsQ.data?.items ?? [];
  const reviews = reviewQ.data?.items ?? [];
  const resources = resourcesQ.data?.items ?? [];

  const totalErrors = errors.length;
  const masteredErrors = errors.filter((e) => e.mastered).length;
  const masteryRate = totalErrors > 0 ? Math.round((masteredErrors / totalErrors) * 100) : 0;
  const knowledgePoints = resources.filter((r) => r.category === "knowledge-point").length;
  const activeReviewPlan = reviews[0];
  const reviewProgress = activeReviewPlan
    ? activeReviewPlan.total_tasks > 0
      ? Math.round((activeReviewPlan.completed_tasks / activeReviewPlan.total_tasks) * 100)
      : 0
    : 0;

  const subjectBreakdown = errors.reduce<Record<string, { total: number; mastered: number }>>((acc, e) => {
    if (!acc[e.subject]) acc[e.subject] = { total: 0, mastered: 0 };
    acc[e.subject].total++;
    if (e.mastered) acc[e.subject].mastered++;
    return acc;
  }, {});

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="caption-uppercase">
          <BrandMark className="mr-2 inline h-3 w-3 text-[var(--color-coral)]" />
          学习总览
        </div>
        <h1 className="font-display-tight text-[40px] leading-[1.05] tracking-tight text-ink dark:text-on-dark md:text-[48px]">
          学习进度一览
        </h1>
        <p className="max-w-2xl text-[15px] leading-[1.65] text-[var(--color-body)] dark:text-[var(--color-on-dark-soft)]">
          汇总课堂互动、错题掌握与复习计划的整体进展，帮你看清薄弱点与成长轨迹。
        </p>
      </header>

      {/* ── Hero Stats ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={BookX}
          label="错题总数"
          value={totalErrors.toString()}
          accent="#cc785c"
          sub={`已掌握 ${masteredErrors}`}
        />
        <StatCard
          icon={Award}
          label="掌握率"
          value={`${masteryRate}%`}
          accent="#5db8a6"
          sub="错题攻克比例"
        />
        <StatCard
          icon={Target}
          label="知识卡片"
          value={knowledgePoints.toString()}
          accent="#e8a55a"
          sub="课堂沉淀"
        />
        <StatCard
          icon={Flame}
          label="复习进度"
          value={activeReviewPlan ? `${reviewProgress}%` : "—"}
          accent="#cc785c"
          sub={activeReviewPlan?.plan_title?.slice(0, 12) ?? "暂无计划"}
        />
      </div>

      {/* ── Mastery Ring + Subject Breakdown ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <MasteryRing rate={masteryRate} total={totalErrors} mastered={masteredErrors} />
        <SubjectGrid subjects={subjectBreakdown} />
      </div>

      {/* ── Active Review Plan ── */}
      {activeReviewPlan && (
        <ActivePlanCard plan={activeReviewPlan} progress={reviewProgress} />
      )}

      {/* ── Quick Links ── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <QuickLink
          to="/classroom"
          icon={MessageSquareText}
          accent="#5db8a6"
          title="课堂互动"
          desc="开始一次启发式学习"
        />
        <QuickLink
          to="/errors"
          icon={BookX}
          accent="#cc785c"
          title="错题管理"
          desc="查看错因分析与变形题"
        />
        <QuickLink
          to="/review"
          icon={CalendarClock}
          accent="#e8a55a"
          title="复习策略"
          desc="生成或跟进复习计划"
        />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  sub,
}: {
  icon: typeof BookX;
  label: string;
  value: string;
  accent: string;
  sub: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-5 transition duration-500 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(20,20,19,0.06)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-2">
        <div
          className="grid h-8 w-8 place-items-center rounded-lg"
          style={{ background: `${accent}18`, color: accent }}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>
        <span className="text-[11px] font-medium text-[var(--color-muted)] dark:text-[var(--color-on-dark-soft)]">
          {label}
        </span>
      </div>
      <div className="mt-4 font-display text-[32px] leading-none tracking-tight text-ink dark:text-on-dark">
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] text-[var(--color-muted)] dark:text-[var(--color-on-dark-soft)]">
        {sub}
      </div>
    </div>
  );
}

function MasteryRing({ rate, total, mastered }: { rate: number; total: number; mastered: number }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (rate / 100) * circumference;

  return (
    <div className="flex items-center gap-8 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-8 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
      <div className="relative shrink-0">
        <svg width="128" height="128" viewBox="0 0 128 128" className="rotate-[-90deg]">
          <circle cx="64" cy="64" r="54" fill="none" stroke="var(--color-surface-soft)" strokeWidth="10" className="dark:stroke-[var(--color-surface-dark-soft)]" />
          <circle cx="64" cy="64" r="54" fill="none" stroke="#5db8a6" strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-[stroke-dashoffset] duration-1000 ease-out" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[28px] tracking-tight text-ink dark:text-on-dark">{rate}%</span>
          <span className="text-[10px] text-[var(--color-muted)]">掌握率</span>
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="font-display text-[20px] tracking-tight text-ink dark:text-on-dark">错题攻克进度</h3>
        <p className="text-[13px] leading-[1.6] text-[var(--color-body)] dark:text-[var(--color-on-dark-soft)]">
          共 {total} 道错题，已掌握 {mastered} 道。
          {rate < 50 && " 继续加油，多做变形题巩固薄弱点。"}
          {rate >= 50 && rate < 80 && " 进展不错，保持复习节奏。"}
          {rate >= 80 && " 表现优秀，可以挑战更高难度。"}
        </p>
        <Link to="/errors" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-coral)] hover:underline">
          查看错题详情 <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

function SubjectGrid({ subjects }: { subjects: Record<string, { total: number; mastered: number }> }) {
  const entries = Object.entries(subjects).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-6 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
      <div className="flex items-center gap-2 pb-4">
        <TrendingUp className="h-4 w-4 text-[var(--color-coral)]" strokeWidth={2} />
        <h3 className="font-display text-[18px] tracking-tight text-ink dark:text-on-dark">各学科错题分布</h3>
      </div>
      {entries.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-[var(--color-muted)]">暂无错题数据</p>
      ) : (
        <div className="space-y-3">
          {entries.slice(0, 6).map(([subject, data]) => {
            const pct = data.total > 0 ? Math.round((data.mastered / data.total) * 100) : 0;
            return (
              <div key={subject} className="space-y-1.5">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium text-ink dark:text-on-dark">{subject}</span>
                  <span className="tabular-nums text-[var(--color-muted)]">{data.mastered}/{data.total} 已掌握</span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActivePlanCard({ plan, progress }: { plan: { plan_title: string; subject: string; completed_tasks: number; total_tasks: number }; progress: number }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--color-hairline)] bg-gradient-to-br from-[var(--color-surface-soft)] to-[var(--color-canvas)] p-8 dark:border-[rgba(250,249,245,0.08)] dark:from-[var(--color-surface-dark-soft)] dark:to-[var(--color-surface-dark-elev)]">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-15 blur-3xl" style={{ background: "#e8a55a" }} />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="caption-uppercase text-[10px]">
            <CalendarClock className="mr-1.5 inline h-3 w-3 text-[#e8a55a]" strokeWidth={2} />
            当前复习计划 · {plan.subject}
          </div>
          <h3 className="font-display text-[24px] tracking-tight text-ink dark:text-on-dark">{plan.plan_title}</h3>
          <div className="flex items-center gap-4">
            <Progress value={progress} className="h-2.5 w-48" />
            <span className="text-[13px] font-medium tabular-nums text-ink dark:text-on-dark">{progress}%</span>
            <span className="text-[12px] text-[var(--color-muted)]">{plan.completed_tasks}/{plan.total_tasks} 任务</span>
          </div>
        </div>
        <Link to="/review" className="inline-flex shrink-0 items-center gap-2 rounded-md bg-[var(--color-coral)] px-5 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[var(--color-coral-active)]">
          继续复习 <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, accent, title, desc }: { to: string; icon: typeof BookX; accent: string; title: string; desc: string }) {
  return (
    <Link to={to} className="group flex items-center gap-4 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-5 transition duration-300 hover:-translate-y-0.5 hover:border-[var(--color-muted-soft)] hover:shadow-[0_4px_16px_rgba(20,20,19,0.05)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg transition duration-300 group-hover:scale-110" style={{ background: `${accent}18`, color: accent }}>
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div className="flex-1">
        <div className="text-[14.5px] font-medium text-ink dark:text-on-dark">{title}</div>
        <div className="text-[12px] text-[var(--color-muted)] dark:text-[var(--color-on-dark-soft)]">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-[var(--color-muted)] transition group-hover:translate-x-1 group-hover:text-ink dark:group-hover:text-on-dark" strokeWidth={1.75} />
    </Link>
  );
}
