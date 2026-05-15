import { History } from "lucide-react";
import type { ArchivedSession } from "./types";

export function ArchivedSessionList({
  sessions,
  onResume,
  onClear,
}: {
  sessions: ArchivedSession[];
  onResume: (s: ArchivedSession) => void;
  onClear: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-4 py-2 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
        <History className="h-3.5 w-3.5 text-[var(--color-coral)]" strokeWidth={2} />
        <span className="text-[12.5px] font-medium">历史课堂</span>
        <span className="ml-auto text-[11px] text-[var(--color-muted)]">{sessions.length} 条</span>
        {sessions.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-[var(--color-hairline)] px-2 py-0.5 text-[10.5px] text-[var(--color-muted)] hover:bg-[var(--color-canvas)] dark:border-[rgba(250,249,245,0.08)]"
          >
            清空
          </button>
        )}
      </div>
      {sessions.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-[var(--color-muted)]">暂无归档课堂</p>
      ) : (
        <div className="max-h-52 overflow-y-auto divide-y divide-[var(--color-hairline)] dark:divide-[rgba(250,249,245,0.06)]">
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              type="button"
              onClick={() => onResume(s)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--color-surface-soft)] dark:hover:bg-[var(--color-surface-dark-soft)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink dark:text-on-dark">{s.title}</p>
                <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                  {new Date(s.archivedAt).toLocaleString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {s.messageCount} 条消息
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-[10px] text-[var(--color-body-strong)] dark:border-[rgba(250,249,245,0.08)] dark:text-[var(--color-on-dark-soft)]">
                {s.subject}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
