import { useMemo } from "react";
import { Progress } from "@/components/ui/progress";
import type { StageEvent } from "./types";

interface ProgressState {
  step: number;
  total: number;
  percent: number;
}

function parseProgressFromEvents(events: StageEvent[]): ProgressState | null {
  const progressEvents = events.filter((e) => e.type === "progress");
  if (progressEvents.length === 0) return null;

  const latest = progressEvents[progressEvents.length - 1];
  const payload = latest.payload as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object") return null;

  if (typeof payload.percent === "number") {
    return { step: 0, total: 0, percent: Math.min(100, Math.max(0, payload.percent)) };
  }
  if (typeof payload.step === "number" && typeof payload.total === "number" && payload.total > 0) {
    return {
      step: payload.step,
      total: payload.total,
      percent: Math.round((payload.step / payload.total) * 100),
    };
  }
  return null;
}

export function StageProgress({ events }: { events: StageEvent[] }) {
  const progress = useMemo(() => parseProgressFromEvents(events), [events]);

  if (!progress) return null;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-4 py-2 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
      <Progress value={progress.percent} className="h-2 flex-1" />
      <span className="shrink-0 text-[11px] font-medium text-[var(--color-body-strong)] dark:text-[var(--color-on-dark-soft)]">
        {progress.total > 0
          ? `第 ${progress.step}/${progress.total} 步`
          : `${progress.percent}%`}
      </span>
    </div>
  );
}
