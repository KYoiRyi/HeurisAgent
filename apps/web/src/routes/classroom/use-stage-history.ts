import { useState, useCallback, useMemo } from "react";
import type { LiveComponent, RuntimeMessage } from "./types";

export interface StageHistoryEntry {
  id: string;
  component: LiveComponent;
  ts: string;
  messageId: string;
}

export function useStageHistory(messages: RuntimeMessage[]) {
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);

  const allStages = useMemo((): StageHistoryEntry[] => {
    const entries: StageHistoryEntry[] = [];
    for (const msg of messages) {
      if (msg.liveComponent) {
        entries.push({
          id: `stage-${msg.id}`,
          component: msg.liveComponent,
          ts: msg.ts,
          messageId: msg.id,
        });
      }
    }
    return entries;
  }, [messages]);

  const latestStage = allStages.length > 0 ? allStages[allStages.length - 1] : null;

  const activeStage = useMemo(() => {
    if (!viewingHistoryId) return latestStage;
    return allStages.find((s) => s.id === viewingHistoryId) ?? latestStage;
  }, [viewingHistoryId, allStages, latestStage]);

  const isViewingHistory = viewingHistoryId !== null && viewingHistoryId !== latestStage?.id;

  const viewStage = useCallback((id: string) => {
    setViewingHistoryId(id);
  }, []);

  const returnToLive = useCallback(() => {
    setViewingHistoryId(null);
  }, []);

  return {
    allStages,
    activeStage,
    latestStage,
    isViewingHistory,
    viewStage,
    returnToLive,
  };
}
