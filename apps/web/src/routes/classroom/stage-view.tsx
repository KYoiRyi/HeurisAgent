import { Lightbulb, Sparkles, Bot } from "lucide-react";
import type { LiveComponent, StageEvent } from "./types";
import { buildStageSrcDoc, formatStageEvent } from "./utils";
import { StageProgress } from "./stage-progress";
import { StageTypeBadge } from "./stage-type-chrome";

export function StageView({
  component,
  events,
}: {
  component: LiveComponent;
  events: StageEvent[];
}) {
  return (
    <div className="absolute inset-0 flex flex-col bg-[var(--color-canvas)] dark:bg-[var(--color-surface-dark)]">
      <StageProgress events={events} />
      <iframe
        title="live-stage"
        className="min-h-0 w-full flex-1 border-0"
        srcDoc={buildStageSrcDoc(component)}
        sandbox="allow-scripts allow-same-origin"
      />
      {(events.length > 0 || component.description) && (
        <div className="flex shrink-0 items-center gap-3 border-t border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-4 py-1.5 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-body-strong)] dark:text-[var(--color-on-dark-soft)]">
            <Lightbulb className="h-3 w-3 text-[var(--color-coral)]" strokeWidth={2} />
            <span className="max-w-[200px] truncate">{component.description}</span>
            {component.stageType && <StageTypeBadge type={component.stageType} />}
          </div>
          {events.length > 0 && (
            <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
              <Sparkles className="h-2.5 w-2.5 shrink-0 text-[var(--color-coral)]" strokeWidth={2} />
              {events.slice(-4).map((event) => (
                <span
                  key={event.id}
                  title={formatStageEvent(event)}
                  className="max-w-[10rem] shrink-0 truncate rounded border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-1.5 py-0.5 text-[10px] text-[var(--color-body-strong)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)] dark:text-on-dark"
                >
                  {formatStageEvent(event)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EmptyStage({ hasComponent }: { hasComponent: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center text-center text-[var(--color-muted)]">
      <div className="space-y-3">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-surface-card)] dark:bg-[var(--color-surface-dark-elev)]">
          <Bot className="h-7 w-7 text-[var(--color-coral)]" strokeWidth={1.75} />
        </div>
        <div className="font-display text-[18px] tracking-tight text-ink dark:text-on-dark">
          黑板就绪 · 等待第一道题
        </div>
        <div className="mx-auto max-w-md text-[12.5px]">
          在右侧对话框提一个问题，智能体会用启发式方式带你拆解。
        </div>
      </div>
    </div>
  );
}
