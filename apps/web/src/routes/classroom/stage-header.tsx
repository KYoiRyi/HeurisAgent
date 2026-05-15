import { Terminal, MessageCircle, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export function StageHeader({
  subject,
  isChatOpen,
  onToggleChat,
  onToggleLogs,
  showLogs,
  autoSubmitEnabled,
  onToggleAutoSubmit,
}: {
  subject: string;
  isChatOpen: boolean;
  onToggleChat: () => void;
  onToggleLogs: () => void;
  showLogs: boolean;
  autoSubmitEnabled: boolean;
  onToggleAutoSubmit: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-5 py-3 dark:border-[rgba(250,249,245,0.08)]">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-[var(--color-coral)]" strokeWidth={2} />
        <div className="caption-uppercase text-[10px]">互动黑板</div>
        <span className="caption-uppercase">·</span>
        <span className="font-display text-[15px] tracking-tight text-ink dark:text-on-dark">{subject}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleAutoSubmit}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition",
            autoSubmitEnabled
              ? "border-[var(--color-coral)] bg-[var(--color-coral)]/10 text-[var(--color-coral-active)]"
              : "border-[var(--color-hairline)] text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]",
          )}
          title="自动提交：答题后自动发送给 AI 评判"
        >
          ⚡ 自动
        </button>
        <button
          type="button"
          onClick={onToggleLogs}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition",
            showLogs
              ? "border-[var(--color-coral)] bg-[var(--color-coral)]/10 text-[var(--color-coral-active)]"
              : "border-[var(--color-hairline)] text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]",
          )}
          title="切换运行日志 (Ctrl+L)"
        >
          <Terminal className="h-3 w-3" strokeWidth={2} />
          日志
        </button>
        <button
          type="button"
          onClick={onToggleChat}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--color-hairline)] px-2 text-[11px] text-ink transition hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:text-on-dark"
        >
          <MessageCircle className="h-3 w-3" strokeWidth={2} />
          {isChatOpen ? "收起对话" : "展开对话"}
        </button>
      </div>
    </div>
  );
}
