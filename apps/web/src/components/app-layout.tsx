import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FolderOpen,
  Brain,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  KeyRound,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { AGENT_THEMES, type AgentKey, type AgentTheme } from "@/lib/agents";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/brand-mark";
import { api } from "@/lib/api";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  agent?: AgentKey;
  group: "core" | "support";
}

const navItems: NavItem[] = [
  { to: "/", label: "首页", icon: LayoutDashboard, group: "core" },
  { to: "/dashboard", label: "学习总览", icon: Activity, group: "core" },
  { to: "/classroom", label: "课堂互动", icon: AGENT_THEMES.classroom.icon, agent: "classroom", group: "core" },
  { to: "/errors", label: "错题管理", icon: AGENT_THEMES.errors.icon, agent: "errors", group: "core" },
  { to: "/review", label: "复习策略", icon: AGENT_THEMES.review.icon, agent: "review", group: "core" },
  { to: "/resources", label: "教学资源", icon: FolderOpen, group: "support" },
  { to: "/memory", label: "记忆中心", icon: Brain, group: "support" },
  { to: "/settings", label: "AI 设置", icon: Settings, group: "support" },
];

const navGroups: Array<{ key: NavItem["group"]; title: string }> = [
  { key: "core", title: "智能体" },
  { key: "support", title: "知识与配置" },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const active = navItems.find((item) =>
    item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to),
  );
  const activeAgent: AgentTheme | null = active?.agent ? AGENT_THEMES[active.agent] : null;

  return (
    <div className="relative flex min-h-screen bg-canvas text-ink">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div
        className={cn(
          "flex min-h-screen flex-1 flex-col transition-[margin] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed ? "ml-[76px]" : "ml-[268px]",
        )}
      >
        <TopBar activeLabel={active?.label ?? "启发式学习智能体"} agent={activeAgent} />
        <main className="flex-1 px-6 pb-16 pt-8 md:px-12 lg:px-16">
          <div className="mx-auto w-full max-w-[1200px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--color-hairline)] bg-[var(--color-canvas)] transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-[rgba(250,249,245,0.06)] dark:bg-[var(--color-surface-dark)]",
        collapsed ? "w-[76px]" : "w-[268px]",
      )}
    >
      <div className="flex items-center gap-3 px-5 py-6 overflow-hidden">
        <BrandMark className="h-7 w-7 shrink-0 text-ink dark:text-on-dark" />
        <div
          className={cn(
            "min-w-0 leading-tight transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            collapsed ? "pointer-events-none w-0 -translate-x-2 opacity-0" : "translate-x-0 opacity-100",
          )}
        >
          <div className="whitespace-nowrap font-display text-[20px] tracking-tight">启发式学习智能体</div>
          <div className="whitespace-nowrap caption-uppercase text-[10px]">启发式学业智能体</div>
        </div>
      </div>

      <div className="mx-5 h-px bg-[var(--color-hairline)] dark:bg-[rgba(250,249,245,0.06)]" />

      <nav className="flex-1 space-y-7 overflow-y-auto overflow-x-hidden px-3 py-6">
        {navGroups.map((group) => (
          <div key={group.key} className="space-y-1.5">
            <div
              className={cn(
                "px-3 pb-1 caption-uppercase whitespace-nowrap transition-[opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
                collapsed ? "opacity-0" : "opacity-100",
              )}
            >
              {group.title}
            </div>
            {navItems
              .filter((item) => item.group === group.key)
              .map((item) => (
                <SidebarLink key={item.to} item={item} collapsed={collapsed} />
              ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--color-hairline)] p-3 dark:border-[rgba(250,249,245,0.06)]">
        <button
          onClick={onToggle}
          className={cn(
            "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-soft)] hover:text-ink dark:hover:bg-[var(--color-surface-dark-elev)] dark:hover:text-on-dark",
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4 shrink-0" /> : <PanelLeftClose className="h-4 w-4 shrink-0" />}
          <span
            className={cn(
              "whitespace-nowrap transition-[opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
              collapsed ? "opacity-0" : "opacity-100",
            )}
          >
            收起边栏
          </span>
        </button>
      </div>
    </aside>
  );
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const theme: AgentTheme | null = item.agent ? AGENT_THEMES[item.agent] : null;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      title={collapsed ? item.label : undefined}
      style={theme ? ({ ["--agent-accent" as string]: theme.accent } as React.CSSProperties) : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] transition-all duration-300",
          isActive
            ? "bg-[var(--color-surface-card)] text-ink shadow-[inset_0_-1px_0_rgba(20,20,19,0.04)] dark:bg-[var(--color-surface-dark-elev)] dark:text-on-dark"
            : "text-[var(--color-body)] hover:bg-[var(--color-surface-soft)] hover:text-ink dark:text-[var(--color-on-dark-soft)] dark:hover:bg-[var(--color-surface-dark-elev)] dark:hover:text-on-dark",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden
              className="absolute inset-y-1 left-0 w-[3px] rounded-r"
              style={{ background: theme ? "var(--agent-accent)" : "var(--color-coral)" }}
            />
          )}
          <span
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-md transition",
              isActive
                ? "text-ink dark:text-on-dark"
                : "text-[var(--color-muted)] group-hover:text-ink dark:group-hover:text-on-dark",
            )}
            style={isActive && theme ? { color: theme.accent } : undefined}
          >
            <item.icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div
            className={cn(
              "flex min-w-0 flex-col leading-tight whitespace-nowrap transition-[opacity,transform] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
              collapsed ? "pointer-events-none w-0 -translate-x-2 opacity-0" : "translate-x-0 opacity-100",
            )}
          >
            <span className="truncate font-medium">{item.label}</span>
            {theme && !isActive && (
              <span className="truncate text-[11px] text-[var(--color-muted-soft)]">{theme.tagline}</span>
            )}
          </div>
        </>
      )}
    </NavLink>
  );
}

function TopBar({ activeLabel, agent }: { activeLabel: string; agent: AgentTheme | null }) {
  const health = useHealthPoll();
  const runtime = useRuntimePoll();
  const llm = useLlmKeyPoll();

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-hairline)] bg-[var(--color-canvas)]/85 backdrop-blur-md dark:border-[rgba(250,249,245,0.06)] dark:bg-[var(--color-surface-dark)]/85">
      <div className="flex h-16 items-center justify-between gap-4 px-6 md:px-12 lg:px-16">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 leading-tight">
            <div className="caption-uppercase text-[10px]">
              {agent ? agent.name : "总控台"}
            </div>
            <h1 className="font-display text-[24px] tracking-tight">
              {activeLabel}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <KeyPill configured={llm.configured} model={llm.model} />
          <StatusPill ok={health.online} label={health.online ? "API 在线" : "API 离线"} />
          <StatusPill ok={runtime.running} label={runtime.running ? "Agent 就绪" : "待启动"} />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function KeyPill({ configured, model }: { configured: boolean; model: string }) {
  return (
    <NavLink
      to="/settings"
      title={configured ? `LLM 已配置 · ${model || "未指定模型"}` : "未配置 API Key，点击前往设置"}
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition md:inline-flex",
        configured
          ? "border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-body-strong)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.10)] dark:bg-[var(--color-surface-dark-elev)] dark:text-on-dark"
          : "border-[var(--color-coral)]/40 bg-[var(--color-coral)]/10 text-[var(--color-coral-active)] hover:bg-[var(--color-coral)]/15",
      )}
    >
      <KeyRound className="h-3 w-3" strokeWidth={2} />
      {configured ? (model ? truncateMiddle(model, 18) : "Key 已存") : "未配置 Key"}
    </NavLink>
  );
}

function truncateMiddle(value: string, max: number): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition md:inline-flex",
        ok
          ? "border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-body-strong)] dark:border-[rgba(250,249,245,0.10)] dark:bg-[var(--color-surface-dark-elev)] dark:text-on-dark"
          : "border-[var(--color-hairline)] bg-[var(--color-surface-soft)] text-[var(--color-muted)] dark:border-[rgba(250,249,245,0.10)] dark:bg-[var(--color-surface-dark-soft)] dark:text-[var(--color-on-dark-soft)]",
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75",
            ok && "animate-[var(--animate-pulse-soft)]",
          )}
          style={{ background: ok ? "#5db872" : "#c64545" }}
        />
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ background: ok ? "#5db872" : "#c64545" }}
        />
      </span>
      <Activity className="h-3 w-3 opacity-60" strokeWidth={2} />
      {label}
    </span>
  );
}

function useHealthPoll() {
  const q = useQuery({
    queryKey: ["health"],
    queryFn: async () => api.get<{ status: string }>("/health"),
    refetchInterval: 10_000,
    retry: 0,
  });
  return { online: !q.isError && q.data?.status === "ok" };
}

function useRuntimePoll() {
  const q = useQuery({
    queryKey: ["agent-status"],
    queryFn: async () => api.get<{ running: boolean }>("/agent/status"),
    refetchInterval: 10_000,
    retry: 0,
  });
  return { running: Boolean(q.data?.running) };
}

function useLlmKeyPoll() {
  const q = useQuery({
    queryKey: ["settings"],
    queryFn: async () => api.get<{ hasApiKey: boolean; model: string }>("/settings"),
    refetchInterval: 30_000,
    retry: 0,
  });
  return { configured: Boolean(q.data?.hasApiKey), model: q.data?.model ?? "" };
}
