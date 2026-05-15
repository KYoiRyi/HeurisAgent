import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DebugLog } from "./types";

export function LogWindow({ logs }: { logs: DebugLog[] }) {
  return (
    <div className="flex max-h-[160px] flex-col overflow-hidden text-[var(--color-on-dark)]">
      <div className="flex items-center gap-2 border-b border-[rgba(250,249,245,0.08)] px-3 py-1.5 text-[11px]">
        <Terminal className="h-3 w-3 text-[var(--accent-teal,#5db8a6)]" />
        <span className="font-medium">运行日志</span>
        <span className="ml-auto text-[10px] text-[var(--color-on-dark-soft)]">{logs.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[10.5px] leading-relaxed">
        {logs.length === 0 ? (
          <div className="text-[var(--color-on-dark-soft)]">waiting for stream…</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="border-b border-[rgba(250,249,245,0.04)] py-0.5 last:border-0">
              <span className="text-[var(--color-on-dark-soft)]">
                {new Date(log.ts).toLocaleTimeString("zh-CN", { hour12: false })}
              </span>{" "}
              <span
                className={cn(
                  log.level === "error"
                    ? "text-[#e88e8e]"
                    : log.level === "warn"
                      ? "text-[#e8c47a]"
                      : "text-[#9bd1a8]",
                )}
              >
                {log.level.toUpperCase()}
              </span>{" "}
              <span>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
