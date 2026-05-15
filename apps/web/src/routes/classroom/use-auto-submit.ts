import { useCallback, useEffect, useRef } from "react";
import type { StageEvent } from "./types";

export function useAutoSubmit({
  enabled,
  running,
  events,
  debounceMs = 1500,
  onSubmit,
}: {
  enabled: boolean;
  running: boolean;
  events: StageEvent[];
  debounceMs?: number;
  onSubmit: (syntheticPrompt: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProcessedRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || running) {
      cancel();
      return;
    }

    const answerEvents = events.filter((e) => e.type === "answer");
    if (answerEvents.length === 0) return;

    const latest = answerEvents[answerEvents.length - 1];
    if (latest.id === lastProcessedRef.current) return;

    cancel();
    timerRef.current = setTimeout(() => {
      lastProcessedRef.current = latest.id;
      const payloadStr = latest.payload != null
        ? typeof latest.payload === "string"
          ? latest.payload
          : JSON.stringify(latest.payload)
        : "";
      const prompt = payloadStr
        ? `[学生在黑板上提交了答案: ${payloadStr.slice(0, 200)}]`
        : "[学生在黑板上提交了答案]";
      onSubmit(prompt);
    }, debounceMs);

    return cancel;
  }, [enabled, running, events, debounceMs, onSubmit, cancel]);

  useEffect(() => cancel, [cancel]);
}
