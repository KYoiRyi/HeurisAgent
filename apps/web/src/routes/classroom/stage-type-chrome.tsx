import type { StageType } from "./types";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<StageType, { label: string; icon: string; color: string }> = {
  quiz: { label: "测验", icon: "✓", color: "text-emerald-600 dark:text-emerald-400" },
  simulation: { label: "模拟", icon: "▶", color: "text-blue-600 dark:text-blue-400" },
  graph: { label: "图表", icon: "📈", color: "text-violet-600 dark:text-violet-400" },
  lab: { label: "实验", icon: "🧪", color: "text-amber-600 dark:text-amber-400" },
  exercise: { label: "练习", icon: "✏", color: "text-rose-600 dark:text-rose-400" },
};

export function StageTypeBadge({ type }: { type: StageType }) {
  const config = TYPE_CONFIG[type];
  if (!config) return null;

  return (
    <span
      className={cn(
        "ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-2 py-0.5 text-[10px] font-medium dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]",
        config.color,
      )}
    >
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}

export function StageTypeChrome({
  type,
  children,
}: {
  type?: StageType;
  children: React.ReactNode;
}) {
  if (!type) return <>{children}</>;

  return (
    <div className="relative flex h-full flex-col">
      {children}
    </div>
  );
}
