import { Bot, Clock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageHistoryEntry } from "./use-stage-history";
import { StageTypeBadge } from "./stage-type-chrome";

export function StageTimeline({
  stages,
  activeId,
  isViewingHistory,
  onSelect,
  onReturnToLive,
}: {
  stages: StageHistoryEntry[];
  activeId: string | null;
  isViewingHistory: boolean;
  onSelect: (id: string) => void;
  onReturnToLive: () => void;
}) {
  if (stages.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-4 py-2 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
      <Clock className="h-3 w-3 shrink-0 text-[var(--color-muted)]" strokeWidth={2} />
      <div className="flex flex-1 gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {stages.map((stage, i) => (
          <button
            key={stage.id}
            type="button"
            onClick={() => onSelect(stage.id)}
            title={stage.component.description}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-medium transition",
              stage.id === activeId
                ? "bg-[var(--color-ink)] text-white dark:bg-[var(--color-on-dark)] dark:text-[var(--color-ink)]"
                : "bg-[var(--color-canvas)] text-[var(--color-body-strong)] hover:bg-[var(--color-surface-card)] dark:bg-[var(--color-surface-dark-elev)] dark:text-[var(--color-on-dark-soft)]",
            )}
          >
            <Bot className="h-2.5 w-2.5" strokeWidth={2} />
            <span className="max-w-[8rem] truncate">{stage.component.description || `黑板 ${i + 1}`}</span>
            {stage.component.stageType && (
              <StageTypeBadge type={stage.component.stageType} />
            )}
          </button>
        ))}
      </div>
      {isViewingHistory && (
        <button
          type="button"
          onClick={onReturnToLive}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-coral)] bg-[var(--color-coral)]/10 px-2.5 py-1 text-[10.5px] font-medium text-[var(--color-coral-active)] transition hover:bg-[var(--color-coral)]/20"
        >
          <RotateCcw className="h-2.5 w-2.5" strokeWidth={2} />
          返回实时
        </button>
      )}
    </div>
  );
}
