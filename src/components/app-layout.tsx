"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, MessageSquareText, BookX, CalendarClock,
  FolderOpen, Activity, Bot, Menu, X, GraduationCap,
  ChevronRight, Sparkles, Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { href: "/", label: "学习仪表盘", icon: LayoutDashboard, color: "text-blue-500" },
  { href: "/classroom", label: "课堂互动", icon: MessageSquareText, color: "text-emerald-500", agent: "课堂智能体" },
  { href: "/errors", label: "错题管理", icon: BookX, color: "text-orange-500", agent: "错题智能体" },
  { href: "/review", label: "复习策略", icon: CalendarClock, color: "text-purple-500", agent: "复习智能体" },
  { href: "/resources", label: "教学资源", icon: FolderOpen, color: "text-cyan-500" },
  { href: "/monitor", label: "智能体监控", icon: Activity, color: "text-rose-500" },
  { href: "/settings", label: "AI 设置", icon: Settings, color: "text-slate-500" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [llmOk, setLlmOk] = useState<boolean | null>(null);
  const [llmModel, setLlmModel] = useState("");

  useEffect(() => {
    setMounted(true);
    fetch("/api/v1/health")
      .then((r) => r.json())
      .then((d) => {
        setLlmOk(d.services?.llm?.ok ?? false);
        setLlmModel(d.services?.llm?.model || "");
      })
      .catch(() => setLlmOk(false));
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-primary animate-pulse" />
          <span className="text-xl font-bold">EduAgentX</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-300",
          sidebarOpen ? "w-64" : "w-16"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            {sidebarOpen && (
              <div className="flex flex-col">
                <span className="text-base font-bold tracking-tight">EduAgentX</span>
                <span className="text-[10px] text-muted-foreground leading-none">多智能体学习平台</span>
              </div>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 p-2 mt-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className={cn("h-4.5 w-4.5 shrink-0", isActive ? item.color : "")} />
                {sidebarOpen && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {item.agent && (
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                        <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                        AI
                      </Badge>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* LLM Status */}
        {sidebarOpen && (
          <div className="absolute bottom-0 left-0 right-0 border-t p-4">
            <Link href="/settings" className="block rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 p-3 hover:from-primary/10 hover:to-primary/15 transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold">AI 提供商</span>
                <div className={cn(
                  "ml-auto h-2 w-2 rounded-full",
                  llmOk === null ? "bg-yellow-400 animate-pulse" :
                  llmOk ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                )} />
              </div>
              <p className="text-[10px] text-muted-foreground truncate">
                {llmOk === null ? "检测中…" :
                 llmOk ? ("✓ 已连接" + (llmModel ? " · " + llmModel : "")) :
                 "⚠ LLM 未连接 — 点击配置"}
              </p>
            </Link>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          "transition-all duration-300",
          sidebarOpen ? "ml-64" : "ml-16"
        )}
      >
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-background/80 backdrop-blur-sm px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GraduationCap className="h-4 w-4" />
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">
              {navItems.find((item) =>
                item.href === pathname || (item.href !== "/" && pathname.startsWith(item.href))
              )?.label || "仪表盘"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Badge
              variant={llmOk === false ? "destructive" : "outline"}
              className="text-xs"
            >
              <Bot className="h-3 w-3 mr-1" />
              {llmOk === null ? "检测中" : llmOk ? "AI 在线" : "AI 离线"}
            </Badge>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
