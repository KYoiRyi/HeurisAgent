import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScoreFeedback } from "./types";

export function StageScoreFeedback({ feedback }: { feedback: ScoreFeedback | null | undefined }) {
  if (!feedback) return null;

  const percent = feedback.total > 0 ? Math.round((feedback.score / feedback.total) * 100) : 0;
  const isGood = percent >= 60;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-3 border-b px-4 py-2.5 animate-in slide-in-from-top-2 duration-300",
        isGood
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30"
          : "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30",
      )}
    >
      {isGood ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" strokeWidth={2} />
      )}
      <div className="flex-1 text-[12px]">
        <span
          className={cn(
            "font-semibold",
            isGood ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300",
          )}
        >
          {feedback.score}/{feedback.total}
        </span>
        {feedback.feedback && (
          <span className="ml-2 text-[var(--color-body-strong)] dark:text-[var(--color-on-dark-soft)]">
            {feedback.feedback}
          </span>
        )}
      </div>
      {feedback.correct !== undefined && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
            feedback.correct
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
              : "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
          )}
        >
          {feedback.correct ? "正确" : "需改进"}
        </span>
      )}
    </div>
  );
}
