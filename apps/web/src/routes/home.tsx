import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight, Sparkles } from "lucide-react";
import { AGENT_LIST, type AgentTheme } from "@/lib/agents";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

export default function HomeRoute() {
  return (
    <div className="space-y-20">
      <Hero />

      <section className="space-y-8">
        <SectionHeader
          eyebrow="三位一体"
          title="三智能体协同学习"
          description="课堂、错题、复习共享同一份记忆与教学资源，每一次互动都是下一轮规划的输入。"
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {AGENT_LIST.map((agent, idx) => (
            <AgentCard key={agent.key} agent={agent} index={idx} />
          ))}
        </div>
      </section>

      <CtaBand />

      <section>
        <QuickActionsPanel />
      </section>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-6 py-14 md:px-12 md:py-20">
      <BackdropAccent />
      <div className="relative z-10 grid gap-10 md:grid-cols-[1.15fr_0.85fr] md:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-1 text-[12px] font-medium text-[var(--color-body-strong)] shadow-sm dark:border-[rgba(250,249,245,0.10)] dark:bg-[var(--color-surface-dark-elev)] dark:text-on-dark">
            <BrandMark className="h-3 w-3 text-[var(--color-coral)]" />
            <span>启发式学习智能体</span>
          </div>
          <h1 className="font-display-tight text-[44px] leading-[1.05] text-ink dark:text-on-dark md:text-[60px]">
            把整段学习闭环
            <br />
            交给<span className="italic text-[var(--color-coral)]">启发式智能体</span>。
          </h1>
          <p className="max-w-xl text-[16px] leading-[1.65] text-[var(--color-body)] dark:text-[var(--color-on-dark-soft)]">
            课堂互动、错题诊断、复习排程三位一体。本地 PostgreSQL 持久化、单机 LLM 工具循环——
            离线可用，记忆持久，每次对话都会沉淀为知识、错题与下一轮计划。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/classroom"
              className="group inline-flex items-center gap-2 rounded-md bg-[var(--color-coral)] px-5 py-2.5 text-[14px] font-medium text-white transition hover:bg-[var(--color-coral-active)]"
            >
              进入课堂
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" strokeWidth={2} />
            </Link>
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-5 py-2.5 text-[14px] font-medium text-ink transition hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.10)] dark:bg-[var(--color-surface-dark-elev)] dark:text-on-dark dark:hover:bg-[var(--color-surface-dark-soft)]"
            >
              配置 LLM
            </Link>
          </div>
        </div>
        <HeroProductCard />
      </div>
    </section>
  );
}

function BackdropAccent() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl animate-[var(--animate-float)]"
        style={{ background: "radial-gradient(circle, rgba(204,120,92,0.45), transparent 65%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(93,184,166,0.4), transparent 65%)" }}
      />
    </>
  );
}

function HeroProductCard() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-[var(--color-surface-dark)] p-5 text-on-dark shadow-2xl shadow-black/20 ring-1 ring-black/10">
      <div className="flex items-center gap-2 pb-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[11px] font-mono text-[var(--color-on-dark-soft)]">
          heuris ▸ classroom ▸ session
        </span>
      </div>
      <div className="space-y-3 rounded-lg bg-[var(--color-surface-dark-soft)] p-4 font-mono text-[13px] leading-[1.7]">
        <ConsoleLine prefix=">" content="电磁感应是怎么产生电流的？" delay="0s" />
        <ConsoleLine
          prefix="✦"
          accent
          content="磁通量变化 → 电动势 → 电流 (E = BLv)"
          delay="0.4s"
        />
        <ConsoleLine
          prefix="·"
          content="render_live_component(导体棒切割磁感线)"
          tone="muted"
          delay="0.8s"
        />
        <ConsoleLine
          prefix="·"
          content="save_learning_resource(知识卡片)"
          tone="muted"
          delay="1.1s"
        />
        <ConsoleLine
          prefix="·"
          content="add_memory(掌握: 楞次定律)"
          tone="muted"
          delay="1.4s"
        />
      </div>
      <div className="absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-[var(--color-coral)] opacity-20 blur-3xl" />
    </div>
  );
}

function ConsoleLine({
  prefix,
  content,
  tone,
  accent,
  delay,
}: {
  prefix: string;
  content: string;
  tone?: "muted";
  accent?: boolean;
  delay: string;
}) {
  return (
    <div
      className="flex gap-3 opacity-0 animate-[var(--animate-fade-up)]"
      style={{ animationDelay: delay }}
    >
      <span
        className={cn(
          "shrink-0 select-none",
          accent ? "text-[var(--color-coral)]" : "text-[var(--color-on-dark-soft)]",
        )}
      >
        {prefix}
      </span>
      <span
        className={cn(
          tone === "muted" ? "text-[var(--color-on-dark-soft)]" : "text-on-dark",
          accent && "text-[#e8d2c2]",
        )}
      >
        {content}
      </span>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        <div className="caption-uppercase">
          <span className="mr-2 inline-block h-px w-8 align-middle bg-[var(--color-muted-soft)]" />
          {eyebrow}
        </div>
        <h2 className="font-display-tight text-[28px] tracking-tight text-ink dark:text-on-dark md:text-[32px]">
          {title}
        </h2>
      </div>
      <p className="max-w-md text-[14px] leading-[1.6] text-[var(--color-body)] dark:text-[var(--color-on-dark-soft)]">
        {description}
      </p>
    </div>
  );
}


function AgentCard({ agent, index }: { agent: AgentTheme; index: number }) {
  const Icon = agent.icon;
  return (
    <Link
      to={`/${agent.key}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-7 transition duration-500 hover:-translate-y-0.5 hover:border-[var(--color-muted-soft)] hover:shadow-[0_4px_20px_rgba(20,20,19,0.06)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)] dark:hover:border-[rgba(250,249,245,0.18)]"
      style={{ animationDelay: `${index * 80}ms` } as React.CSSProperties}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1 transition-transform duration-500 group-hover:scale-x-100"
        style={{ background: agent.accent }}
      />
      <div className="flex items-center gap-3">
        <div
          className="grid h-11 w-11 place-items-center rounded-md border border-[var(--color-hairline)] bg-[var(--color-surface-card)] text-ink transition duration-500 group-hover:scale-105 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)] dark:text-on-dark"
          style={{ color: agent.accent }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="leading-tight">
          <div className="font-display text-[22px] tracking-tight text-ink dark:text-on-dark">
            {agent.name}
          </div>
          <div className="text-[11px] text-[var(--color-muted)] dark:text-[var(--color-on-dark-soft)]">
            {agent.tagline}
          </div>
        </div>
      </div>
      <p className="mt-6 text-[14.5px] leading-[1.7] text-[var(--color-body)] dark:text-[var(--color-on-dark-soft)]">
        {agent.intro}
      </p>
      <div className="mt-auto flex items-center justify-between pt-7 text-[12.5px]">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium"
          style={{
            color: agent.accent,
            background: "rgba(0,0,0,0.04)",
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: agent.accent }}
          />
          就绪
        </span>
        <span className="inline-flex items-center gap-1 text-[var(--color-muted)] transition group-hover:gap-2 group-hover:text-ink dark:group-hover:text-on-dark">
          打开模块 <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
      </div>
    </Link>
  );
}

function CtaBand() {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-[var(--color-coral)] px-8 py-12 text-white md:px-12 md:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -left-12 h-56 w-56 rounded-full bg-black/10 blur-3xl"
      />
      <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-3">
          <div className="caption-uppercase text-white/70">启发式学习闭环</div>
          <h3 className="max-w-2xl font-display-tight text-[32px] leading-[1.1] md:text-[40px]">
            从一次提问出发，串起讲解、出题、错题归档与复习排程。
          </h3>
          <p className="max-w-xl text-[14.5px] leading-[1.6] text-white/85">
            每个智能体只解决学习闭环里的一段，三段连起来你才会感受到「真的有人在陪你学」。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            to="/classroom"
            className="group inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-[14px] font-medium text-[var(--color-ink)] transition hover:bg-white/90"
          >
            开始一次学习
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function QuickActionsPanel() {
  const actions = [
    { to: "/classroom", label: "进入课堂互动", hint: "启发式讲解 · 互动黑板" },
    { to: "/dashboard", label: "查看学习总览", hint: "进度追踪 · 数据可视化" },
    { to: "/errors", label: "查看错题画像", hint: "错因画像 · 同类变形" },
    { to: "/review", label: "生成复习计划", hint: "节奏化任务" },
  ];

  return (
    <div className="rounded-lg border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-7 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-[var(--color-coral)]" strokeWidth={2} />
        <div className="caption-uppercase">快捷入口</div>
      </div>
      <h3 className="mt-1 font-display text-[22px] tracking-tight text-ink dark:text-on-dark">
        下一步入口
      </h3>
      <div className="mt-5 space-y-2">
        {actions.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="group flex items-center justify-between rounded-md border border-transparent px-3 py-2.5 transition hover:border-[var(--color-hairline)] hover:bg-[var(--color-surface-soft)] dark:hover:border-[rgba(250,249,245,0.08)] dark:hover:bg-[var(--color-surface-dark-soft)]"
          >
            <div className="leading-tight">
              <div className="text-[14px] font-medium text-ink dark:text-on-dark">{a.label}</div>
              <div className="text-[11.5px] text-[var(--color-muted)] dark:text-[var(--color-on-dark-soft)]">
                {a.hint}
              </div>
            </div>
            <ArrowUpRight
              className="h-3.5 w-3.5 text-[var(--color-muted)] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink dark:group-hover:text-on-dark"
              strokeWidth={1.75}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
