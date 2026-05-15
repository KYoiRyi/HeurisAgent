import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, PlusCircle, History, MessageCircle } from "lucide-react";
import { api, subscribeSse } from "@/lib/api";
import type {
  AgentEvent,
  ClassroomHistoryResponse,
  ResourceItem,
  ResourceListResponse,
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
  getArchivedSessions,
  saveArchivedSessions,
  getActiveSessionId,
  setActiveSessionId,
  sanitizeVisibleContent,
} from "./utils";
import { StageHeader } from "./stage-header";
import { StageView, EmptyStage } from "./stage-view";
import { StageTimeline } from "./stage-history";
import { StageScoreFeedback } from "./stage-score-feedback";
import { useStageHistory } from "./use-stage-history";
import { useAutoSubmit } from "./use-auto-submit";
import { ChatPanel } from "./chat-panel";
import { ResourceTabs, ResourceView } from "./resource-tabs";
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
  const [archivedSessions, setArchivedSessions] = useState<ArchivedSession[]>([]);
  const [newClassroomArmed, setNewClassroomArmed] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const [autoSubmitEnabled, setAutoSubmitEnabled] = useState(false);
  const [latestScoreFeedback, setLatestScoreFeedback] = useState<ClassroomRunResponse["scoreFeedback"]>(null);
  const newClassroomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  const stageHistory = useStageHistory(messages);

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

  const resourcesQ = useQuery({
    queryKey: ["classroom-resources", { subject }],
    queryFn: () =>
      api.get<ResourceListResponse>(
        `/resources?${new URLSearchParams({ subject, limit: "30" }).toString()}`,
      ),
    refetchInterval: 30_000,
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
    setArchivedSessions(getArchivedSessions());
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
    const fresh = `local-${Date.now()}`;
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
      qc.invalidateQueries({ queryKey: ["classroom-resources"] });
      qc.invalidateQueries({ queryKey: ["agent-status"] });
      qc.invalidateQueries({ queryKey: ["errors"] });
      qc.invalidateQueries({ queryKey: ["resources"] });
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

  const visibleResources = useMemo(() => {
    const items = resourcesQ.data?.items ?? [];
    return items.filter((r: ResourceItem) =>
      ["document", "note", "knowledge-point", "exercise"].includes(r.category),
    );
  }, [resourcesQ.data]);

  const selectedResource: ResourceItem | null = useMemo(() => {
    if (!selectedTab || selectedTab === INTERACTIVE_TAB) return null;
    return visibleResources.find((r: ResourceItem) => r.id === selectedTab) ?? null;
  }, [selectedTab, visibleResources]);

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
      const firstUser = messages.find((m) => m.role === "student");
      const title =
        firstUser?.content.slice(0, 40) ||
        `${subject} 课堂 ${new Date().toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
      const archive: ArchivedSession = {
        sessionId,
        subject,
        title,
        archivedAt: new Date().toISOString(),
        messageCount: messages.length,
      };
      const updated = [archive, ...getArchivedSessions().filter((s) => s.sessionId !== sessionId)];
      saveArchivedSessions(updated);
      setArchivedSessions(updated);
    }

    setMessages([]);
    setStageEvents([]);
    stageEventsRef.current = [];
    setStatusHints([]);
    setDebugLogs([]);
    setSessionId(null);
    setSelectedTab(null);
    setLatestScoreFeedback(null);
  };

  const handleResumeSession = (archived: ArchivedSession) => {
    setShowHistory(false);
    setSubject(archived.subject);
    setSessionIdState(archived.sessionId);
    setActiveSessionId(archived.subject, archived.sessionId);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="caption-uppercase">Classroom · interactive blackboard</div>
          <h1 className="font-display-tight text-[40px] leading-[1.05] tracking-tight text-ink dark:text-on-dark md:text-[44px]">
            课堂互动
          </h1>
          <p className="max-w-xl text-[14.5px] leading-[1.6] text-[var(--color-body)] dark:text-[var(--color-on-dark-soft)]">
            智能体讲解、生成可交互黑板、记录学习行为，并写回错题与长期记忆。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={runTurn.isPending}
            className="settings-input h-9 max-w-[110px]"
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="学生姓名（可选）"
            disabled={runTurn.isPending}
            className="settings-input h-9 max-w-[140px]"
          />
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-medium transition",
              showHistory
                ? "border-[var(--color-coral)] bg-[var(--color-coral)]/10 text-[var(--color-coral-active)]"
                : "border-[var(--color-hairline)] text-ink hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:text-on-dark",
            )}
          >
            <History className="h-3.5 w-3.5" strokeWidth={2} />
            历史课堂
            {archivedSessions.length > 0 && (
              <span className="ml-0.5 rounded-full bg-[var(--color-coral)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                {archivedSessions.length}
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={runTurn.isPending}
            onClick={handleNewClassroom}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-medium transition",
              newClassroomArmed
                ? "border-[var(--color-coral)] bg-[var(--color-coral)] text-white"
                : "border-[var(--color-hairline)] text-ink hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:text-on-dark",
            )}
          >
            <PlusCircle className="h-3.5 w-3.5" strokeWidth={2} />
            {newClassroomArmed ? "再次点击确认" : "新课堂"}
          </button>
        </div>
      </header>

      {showHistory && (
        <ArchivedSessionList
          sessions={archivedSessions}
          onResume={handleResumeSession}
          onClear={() => { saveArchivedSessions([]); setArchivedSessions([]); }}
        />
      )}

      {statusHints.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {statusHints.map((hint, i) => (
            <span
              key={`${hint}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-2.5 py-1 text-[11.5px] text-[var(--color-body-strong)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)] dark:text-[var(--color-on-dark-soft)]"
            >
              <Sparkles className="h-3 w-3 text-[var(--color-coral)]" />
              {hint}
            </span>
          ))}
        </div>
      )}

      <div className="relative h-[calc(100vh-260px)] min-h-[560px] overflow-hidden rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
        <div className="absolute inset-0 flex flex-col">
          <StageHeader
            subject={subject}
            isChatOpen={isChatOpen}
            onToggleChat={() => setIsChatOpen((v) => !v)}
            onToggleLogs={() => setShowLogs((v) => !v)}
            showLogs={showLogs}
            autoSubmitEnabled={autoSubmitEnabled}
            onToggleAutoSubmit={() => setAutoSubmitEnabled((v) => !v)}
          />
          <ResourceTabs
            subject={subject}
            tabsScrollRef={tabsScrollRef}
            interactiveAvailable={Boolean(activeComponent)}
            resources={visibleResources}
            selectedTab={selectedTab}
            onSelect={setSelectedTab}
            onRefresh={() => qc.invalidateQueries({ queryKey: ["classroom-resources"] })}
            loading={resourcesQ.isFetching}
          />
          <StageTimeline
            stages={stageHistory.allStages}
            activeId={stageHistory.activeStage?.id ?? null}
            isViewingHistory={stageHistory.isViewingHistory}
            onSelect={stageHistory.viewStage}
            onReturnToLive={stageHistory.returnToLive}
          />
          <div className="relative flex-1 overflow-hidden bg-[var(--color-surface-soft)] dark:bg-[var(--color-surface-dark-soft)]">
            {selectedTab === INTERACTIVE_TAB && activeComponent ? (
              <>
                <StageScoreFeedback feedback={latestScoreFeedback} />
                <StageView component={activeComponent} events={stageEvents} />
              </>
            ) : selectedResource ? (
              <ResourceView resource={selectedResource} />
            ) : (
              <EmptyStage hasComponent={Boolean(activeComponent)} />
            )}
          </div>
          {showLogs && (
            <div className="border-t border-[var(--color-hairline)] bg-[var(--color-surface-dark)] dark:border-[rgba(250,249,245,0.08)]">
              <LogWindow logs={debugLogs} />
            </div>
          )}
        </div>

        <aside
          className={cn(
            "absolute inset-y-0 right-0 z-10 flex w-full max-w-[420px] flex-col border-l border-[var(--color-hairline)] bg-[var(--color-canvas)]/95 backdrop-blur-xl transition-transform duration-300 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]/95",
            isChatOpen ? "translate-x-0" : "translate-x-full",
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

        {!isChatOpen && (
          <button
            type="button"
            onClick={() => setIsChatOpen(true)}
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-l-full border border-[var(--color-hairline)] bg-[var(--color-canvas)] py-2 pl-2 pr-3 text-[12px] font-medium text-ink shadow-md hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)] dark:text-on-dark"
          >
            <MessageCircle className="mr-1 inline h-3.5 w-3.5" strokeWidth={2} />
            展开对话
          </button>
        )}
      </div>
    </div>
  );
}
