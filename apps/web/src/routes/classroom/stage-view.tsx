import { Lightbulb, Sparkles, Bot } from "lucide-react";
import type { LiveComponent, StageEvent, StageType } from "./types";
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
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-4 py-2 text-[11.5px] text-[var(--color-body-strong)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)] dark:text-[var(--color-on-dark-soft)]">
        <Lightbulb className="h-3 w-3 text-[var(--color-coral)]" strokeWidth={2} />
        {component.description}
        {component.stageType && (
          <StageTypeBadge type={component.stageType} />
        )}
      </div>
      <StageProgress events={events} />
      <iframe
        title="live-stage"
        className="min-h-0 w-full flex-1 border-0"
        srcDoc={buildStageSrcDoc(component)}
        sandbox="allow-scripts allow-same-origin"
      />
      {events.length > 0 && (
        <div className="shrink-0 border-t border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-3 py-2 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-body-strong)] dark:text-[var(--color-on-dark-soft)]">
            <Sparkles className="h-3 w-3 text-[var(--color-coral)]" strokeWidth={2} />
            <span className="font-medium">交互结果</span>
          </div>
          <div className="mt-1 flex gap-1.5 overflow-x-auto pb-0.5">
            {events.slice(-6).map((event) => (
              <span
                key={event.id}
                title={formatStageEvent(event)}
                className="max-w-[16rem] shrink-0 truncate rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-2 py-1 text-[10.5px] text-[var(--color-body-strong)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)] dark:text-on-dark"
              >
                {formatStageEvent(event)}
              </span>
            ))}
          </div>
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
          {hasComponent ? "选择左上方标签以查看资料" : "黑板就绪 · 等待第一道题"}
        </div>
        <div className="mx-auto max-w-md text-[12.5px]">
          {hasComponent
            ? "智能体生成的可交互组件、保存的知识卡片都会在这里显示。"
            : "在右侧对话框提一个问题，智能体会用启发式方式带你拆解。"}
        </div>
      </div>
    </div>
  );
}
