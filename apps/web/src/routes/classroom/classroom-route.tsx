import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, PlusCircle, History, MessageCircle } from "lucide-react";
import { api, subscribeSse } from "@/lib/api";
import type {
  AgentEvent,
  ClassroomHistoryResponse,
} from "@/lib/api-types";
import { cn } from "@/lib/utils";
import type {
  LiveComponent,
  StageEvent,
  ClassroomRunResponse,
  ArchivedSession,
  RuntimeMessage,
  DebugLog,
} from "./types";
import { SUBJECTS, INTERACTIVE_TAB } from "./types";
import {
  getActiveSessionId,
  setActiveSessionId,
  sanitizeVisibleContent,
} from "./utils";
import { StageView, EmptyStage } from "./stage-view";
import { StageTimeline } from "./stage-history";
import { StageScoreFeedback } from "./stage-score-feedback";
import { useStageHistory } from "./use-stage-history";
import { useAutoSubmit } from "./use-auto-submit";
import { ChatPanel } from "./chat-panel";
import { LogWindow } from "./log-window";
import { ArchivedSessionList } from "./archived-sessions";

export default function ClassroomRoute() {
  const qc = useQueryClient();

  const [subject, setSubject] = useState("数学");
  const [studentName, setStudentName] = useState("");
  const [sessionId, setSessionIdState] = useState<string | null>(null);
  const [messages, setMessages] = useState<RuntimeMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [running, setRunning] = useState(false);
  const [stageEvents, setStageEvents] = useState<StageEvent[]>([]);
  const stageEventsRef = useRef<StageEvent[]>([]);
  const [statusHints, setStatusHints] = useState<string[]>([]);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [newClassroomArmed, setNewClassroomArmed] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const [autoSubmitEnabled, setAutoSubmitEnabled] = useState(false);
  const [latestScoreFeedback, setLatestScoreFeedback] = useState<ClassroomRunResponse["scoreFeedback"]>(null);
  const newClassroomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stageHistory = useStageHistory(messages);

  const sessionsQ = useQuery({
    queryKey: ["classroom-sessions", { subject }],
    queryFn: () => api.get<{ items: ArchivedSession[] }>(`/classroom/sessions?subject=${encodeURIComponent(subject)}&limit=20`),
    refetchOnWindowFocus: false,
  });
  const archivedSessions: ArchivedSession[] = useMemo(() => {
    return (sessionsQ.data?.items ?? []).map((s: any) => ({
      sessionId: s.id,
      subject: s.subject,
      title: s.title,
      archivedAt: s.createdAt ?? s.endedAt ?? new Date().toISOString(),
      messageCount: s.messageCount ?? 0,
    }));
  }, [sessionsQ.data]);

  const setSessionId = useCallback(
    (id: string | null) => {
      setSessionIdState(id);
      setActiveSessionId(subject, id);
    },
    [subject],
  );

  const historyQ = useQuery({
    queryKey: ["classroom-history", { subject, sessionId }],
    queryFn: () => {
      const p = new URLSearchParams({ subject, limit: "60" });
      if (sessionId) p.set("sessionId", sessionId);
      return api.get<ClassroomHistoryResponse>(`/classroom/history?${p.toString()}`);
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!historyQ.data) return;
    const items = historyQ.data.items ?? [];
    const restored: RuntimeMessage[] = items.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      liveComponent: (m.live_component as LiveComponent | null) ?? null,
      toolCalls: ((m.tool_calls ?? []) as Array<{ name?: string; isError?: boolean }>).map((t) => ({
        name: typeof t.name === "string" ? t.name : "tool",
        isError: Boolean(t.isError),
      })),
      ts: m.created_at,
      knowledgePoints: m.related_knowledge_points,
    }));
    setMessages(restored);
    setStageEvents([]);
    stageEventsRef.current = [];
    const lastWithComponent = [...restored].reverse().find((m) => m.liveComponent);
    if (lastWithComponent) setSelectedTab(INTERACTIVE_TAB);
  }, [historyQ.data]);

  useEffect(() => {
    setSessionIdState(getActiveSessionId(subject));
  }, [subject]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setShowLogs((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; eventType?: string; payload?: unknown; description?: string };
      if (!data || data.type !== "heuris-stage-event") return;
      const evt: StageEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: typeof data.eventType === "string" && data.eventType ? data.eventType : "event",
        payload: data.payload ?? null,
        ts: new Date().toISOString(),
        description: typeof data.description === "string" ? data.description : undefined,
      };
      stageEventsRef.current = [...stageEventsRef.current, evt].slice(-20);
      setStageEvents(stageEventsRef.current);
      pushLog({ ts: evt.ts, level: "info", message: `stage ${evt.type}` });
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (!running) return;
    const stop = subscribeSse<AgentEvent>("/agent/events", (event) => {
      if (event.payload?.source !== "classroom") return;
      if (event.type === "tool_start") {
        pushLog({ ts: event.ts, level: "info", message: `tool start: ${String(event.payload.toolName ?? "tool")}` });
        pushHint(`调用工具 ${String(event.payload.toolName ?? "tool")}`);
      } else if (event.type === "tool_end") {
        const isError = Boolean(event.payload.isError);
        pushLog({ ts: event.ts, level: isError ? "error" : "info", message: `tool end: ${String(event.payload.toolName ?? "tool")}` });
      } else if (event.type === "task_done") {
        pushLog({ ts: event.ts, level: "info", message: "stream done" });
      } else if (event.type === "task_error") {
        pushLog({ ts: event.ts, level: "error", message: String(event.payload.error ?? "error") });
      } else if (event.type === "task_start") {
        pushLog({ ts: event.ts, level: "info", message: "agent run started" });
      }
    });
    return stop;
  }, [running]);

  const pushHint = useCallback((hint: string) => {
    setStatusHints((p) => [...p, hint].slice(-6));
  }, []);

  const pushLog = useCallback((log: DebugLog) => {
    setDebugLogs((p) => [...p, log].slice(-180));
  }, []);

  const ensureSession = useCallback((): string => {
    if (sessionId) return sessionId;
    const fresh = crypto.randomUUID();
    setSessionId(fresh);
    return fresh;
  }, [sessionId, setSessionId]);

  const activeComponent = stageHistory.activeStage?.component ?? null;

  const runTurn = useMutation({
    mutationFn: async (prompt: string) => {
      const sid = ensureSession();
      return api.post<ClassroomRunResponse>("/classroom/run", {
        prompt,
        subject,
        studentName: studentName.trim() || undefined,
        sessionId: sid,
        stageEvents: stageEventsRef.current.slice(-12).map((e) => ({
          type: e.type,
          payload: e.payload,
          description: e.description,
        })),
        activeStage: activeComponent ? { description: activeComponent.description } : null,
      });
    },
    onMutate: (prompt) => {
      setRunning(true);
      setStatusHints([]);
      setLatestScoreFeedback(null);
      setDebugLogs([{ ts: new Date().toISOString(), level: "info", message: "client request started" }]);
      const studentMsg: RuntimeMessage = {
        id: `student-${Date.now()}`,
        role: "student",
        content: prompt,
        liveComponent: null,
        toolCalls: [],
        ts: new Date().toISOString(),
      };
      setMessages((p) => [...p, studentMsg]);
    },
    onSuccess: (res) => {
      const agentMsg: RuntimeMessage = {
        id: `agent-${Date.now()}`,
        role: "agent",
        content: sanitizeVisibleContent(res.result),
        liveComponent: res.liveComponents[res.liveComponents.length - 1] ?? null,
        toolCalls: res.toolCalls.map((t) => ({ name: t.name, isError: t.isError })),
        ts: new Date().toISOString(),
        knowledgePoints: res.knowledgePoints,
        scoreFeedback: res.scoreFeedback,
      };
      setMessages((p) => [...p, agentMsg]);
      if (res.liveComponents.length > 0) {
        setSelectedTab(INTERACTIVE_TAB);
        stageEventsRef.current = [];
        setStageEvents([]);
        stageHistory.returnToLive();
      }
      if (res.scoreFeedback) setLatestScoreFeedback(res.scoreFeedback);
      if (res.knowledgePoints.length > 0) pushHint(`知识点已记录：${res.knowledgePoints.join("、")}`);
      if (res.errors.length > 0) pushHint(`错题已记录 ${res.errors.length} 条`);
      if (res.memorySaved > 0) pushHint(`长期记忆 +${res.memorySaved}`);
    },
    onSettled: () => {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["classroom-history"] });
      qc.invalidateQueries({ queryKey: ["classroom-sessions"] });
      qc.invalidateQueries({ queryKey: ["agent-status"] });
      qc.invalidateQueries({ queryKey: ["errors"] });
    },
    onError: (err) => {
      const m = err instanceof Error ? err.message : "请求失败";
      pushLog({ ts: new Date().toISOString(), level: "error", message: m });
      toast.error(m);
    },
  });

  useAutoSubmit({
    enabled: autoSubmitEnabled,
    running,
    events: stageEvents,
    onSubmit: useCallback((prompt: string) => runTurn.mutate(prompt), [runTurn]),
  });

  useEffect(() => {
    if (activeComponent && !selectedTab) setSelectedTab(INTERACTIVE_TAB);
  }, [activeComponent, selectedTab]);

  const handleSubmit = () => {
    if (!inputValue.trim() || runTurn.isPending) return;
    const prompt = inputValue.trim();
    setInputValue("");
    runTurn.mutate(prompt);
  };

  const handleNewClassroom = () => {
    if (!newClassroomArmed) {
      setNewClassroomArmed(true);
      if (newClassroomTimerRef.current) clearTimeout(newClassroomTimerRef.current);
      newClassroomTimerRef.current = setTimeout(() => setNewClassroomArmed(false), 3000);
      return;
    }
    if (newClassroomTimerRef.current) clearTimeout(newClassroomTimerRef.current);
    setNewClassroomArmed(false);

    if (sessionId && messages.length > 0) {
      api.patch(`/classroom/sessions/${sessionId}/archive`, {}).catch(() => {});
    }

    setMessages([]);
    setStageEvents([]);
    stageEventsRef.current = [];
    setStatusHints([]);
    setDebugLogs([]);
    setSessionId(null);
    setSelectedTab(null);
    setLatestScoreFeedback(null);
    qc.invalidateQueries({ queryKey: ["classroom-sessions"] });
  };

  const handleResumeSession = (archived: ArchivedSession) => {
    setShowHistory(false);
    setSubject(archived.subject);
    setSessionIdState(archived.sessionId);
    setActiveSessionId(archived.subject, archived.sessionId);
    qc.invalidateQueries({ queryKey: ["classroom-history"] });
  };

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden">
      {/* Compact toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-hairline)] px-4 py-2 dark:border-[rgba(250,249,245,0.08)]">
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={runTurn.isPending}
          className="settings-input h-8 max-w-[90px] text-[12px]"
        >
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          placeholder="姓名"
          disabled={runTurn.isPending}
          className="settings-input h-8 max-w-[100px] text-[12px]"
        />
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11.5px] font-medium transition",
            showHistory
              ? "border-[var(--color-coral)] bg-[var(--color-coral)]/10 text-[var(--color-coral-active)]"
              : "border-[var(--color-hairline)] text-ink hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:text-on-dark",
          )}
        >
          <History className="h-3 w-3" strokeWidth={2} />
          历史
          {archivedSessions.length > 0 && (
            <span className="rounded-full bg-[var(--color-coral)] px-1 py-0.5 text-[9px] font-medium text-white">
              {archivedSessions.length}
            </span>
          )}
        </button>
        <button
          type="button"
          disabled={runTurn.isPending}
          onClick={handleNewClassroom}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11.5px] font-medium transition",
            newClassroomArmed
              ? "border-[var(--color-coral)] bg-[var(--color-coral)] text-white"
              : "border-[var(--color-hairline)] text-ink hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:text-on-dark",
          )}
        >
          <PlusCircle className="h-3 w-3" strokeWidth={2} />
          {newClassroomArmed ? "确认" : "新课堂"}
        </button>

        {statusHints.length > 0 && (
          <div className="ml-2 flex items-center gap-1.5 overflow-hidden">
            {statusHints.slice(-2).map((hint, i) => (
              <span key={`${hint}-${i}`} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-surface-soft)] px-2 py-0.5 text-[10.5px] text-[var(--color-body-strong)] dark:bg-[var(--color-surface-dark-soft)]">
                <Sparkles className="h-2.5 w-2.5 text-[var(--color-coral)]" />
                {hint}
              </span>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAutoSubmitEnabled((v) => !v)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10.5px] transition",
              autoSubmitEnabled
                ? "border-[var(--color-coral)] bg-[var(--color-coral)]/10 text-[var(--color-coral-active)]"
                : "border-[var(--color-hairline)] text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]",
            )}
            title="自动提交答案"
          >
            ⚡
          </button>
          <button
            type="button"
            onClick={() => setIsChatOpen((v) => !v)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--color-hairline)] px-2 text-[10.5px] text-ink transition hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:text-on-dark"
          >
            <MessageCircle className="h-3 w-3" strokeWidth={2} />
            {isChatOpen ? "收起" : "对话"}
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="shrink-0 border-b border-[var(--color-hairline)] dark:border-[rgba(250,249,245,0.08)]">
          <ArchivedSessionList
            sessions={archivedSessions}
            onResume={handleResumeSession}
            onClear={() => {}}
          />
        </div>
      )}

      {/* Main content: Stage + Chat side by side */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Stage area — takes full remaining space */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <StageTimeline
            stages={stageHistory.allStages}
            activeId={stageHistory.activeStage?.id ?? null}
            isViewingHistory={stageHistory.isViewingHistory}
            onSelect={stageHistory.viewStage}
            onReturnToLive={stageHistory.returnToLive}
          />
          <div className="relative flex-1 overflow-hidden bg-[var(--color-surface-soft)] dark:bg-[var(--color-surface-dark-soft)]">
            {activeComponent ? (
              <>
                <StageScoreFeedback feedback={latestScoreFeedback} />
                <StageView component={activeComponent} events={stageEvents} />
              </>
            ) : (
              <EmptyStage hasComponent={false} />
            )}
          </div>
          {showLogs && (
            <div className="shrink-0 border-t border-[var(--color-hairline)] bg-[var(--color-surface-dark)] dark:border-[rgba(250,249,245,0.08)]">
              <LogWindow logs={debugLogs} />
            </div>
          )}
        </div>

        {/* Chat panel — fixed width sidebar */}
        <aside
          className={cn(
            "flex shrink-0 flex-col border-l border-[var(--color-hairline)] bg-[var(--color-canvas)] transition-[width,opacity] duration-300 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]",
            isChatOpen ? "w-[360px] opacity-100" : "w-0 overflow-hidden opacity-0",
          )}
        >
          <ChatPanel
            messages={messages}
            running={running}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSubmit={handleSubmit}
            onClose={() => setIsChatOpen(false)}
            isLoading={historyQ.isLoading}
            onShowStage={(msg) => {
              if (msg.liveComponent) {
                setSelectedTab(INTERACTIVE_TAB);
                const entry = stageHistory.allStages.find((s) => s.messageId === msg.id);
                if (entry) stageHistory.viewStage(entry.id);
              }
            }}
          />
        </aside>
      </div>
    </div>
  );
}
