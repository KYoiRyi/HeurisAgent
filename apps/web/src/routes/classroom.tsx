import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Send,
  Sparkles,
  Wrench,
  Loader2,
  X,
  Layers,
  PlusCircle,
  History,
  MessageCircle,
  Bot,
  User,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Terminal,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileText,
} from "lucide-react";
import { api, subscribeSse } from "@/lib/api";
import type {
  AgentEvent,
  ClassroomHistoryResponse,
  ClassroomMessage,
  ResourceItem,
  ResourceListResponse,
} from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";

interface LiveComponent {
  html: string;
  css?: string;
  js?: string;
  description: string;
}

interface ToolCallView {
  name: string;
  args?: unknown;
  isError?: boolean;
}

interface StageEvent {
  id: string;
  type: string;
  payload: unknown;
  ts: string;
  description?: string;
}

interface ClassroomRunResponse {
  result: string;
  liveComponents: LiveComponent[];
  toolCalls: ToolCallView[];
  resources: Array<{ id: string; title: string; category: string }>;
  errors: Array<{ id: string; questionText: string; errorType: string | null }>;
  memorySaved: number;
  knowledgePoints: string[];
}

interface ArchivedSession {
  sessionId: string;
  subject: string;
  title: string;
  archivedAt: string;
  messageCount: number;
}

interface RuntimeMessage {
  id: string;
  role: "student" | "agent";
  content: string;
  liveComponent: LiveComponent | null;
  toolCalls: ToolCallView[];
  ts: string;
  knowledgePoints?: string[];
}

interface DebugLog {
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
}

const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "通用"];
const LS_ACTIVE_SESSION = (subject: string) => `heuris-active-session:${subject}`;
const LS_SESSIONS_LIST = "heuris-archived-sessions";
const INTERACTIVE_TAB = "interactive-stage";

function getArchivedSessions(): ArchivedSession[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_SESSIONS_LIST) ?? "[]");
  } catch {
    return [];
  }
}

function saveArchivedSessions(list: ArchivedSession[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_SESSIONS_LIST, JSON.stringify(list.slice(0, 20)));
}

function getActiveSessionId(subject: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_ACTIVE_SESSION(subject)) ?? null;
}

function setActiveSessionId(subject: string, id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(LS_ACTIVE_SESSION(subject), id);
  else localStorage.removeItem(LS_ACTIVE_SESSION(subject));
}

function buildStageSrcDoc(component: LiveComponent): string {
  const description = JSON.stringify(component.description || "互动黑板");
  const css = component.css ?? "";
  const js = (component.js ?? "").replace(/<\/script/gi, "<\\/script");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; padding: 0; min-height: 100vh; overflow-x: hidden; background: #faf9f5; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #141413;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      padding: 1.25rem;
    }
    #heuris-stage-container {
      margin: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      max-width: 720px;
    }
    button { font-family: inherit; }
    ${css}
  </style>
</head>
<body>
  <div id="heuris-stage-container">
    ${component.html}
  </div>
  <script>
    (function () {
      var stageDescription = ${description};
      function emit(eventType, payload) {
        window.parent.postMessage({
          type: "heuris-stage-event",
          eventType: eventType || "event",
          payload: payload == null ? null : payload,
          description: stageDescription
        }, "*");
      }
      window.HeurisStage = {
        emit: emit,
        answer: function (payload) { emit("answer", payload); },
        progress: function (payload) { emit("progress", payload); }
      };
      window.addEventListener("error", function (event) {
        emit("runtime-error", { message: event.message, line: event.lineno, column: event.colno });
      });
      window.addEventListener("unhandledrejection", function (event) {
        var reason = event.reason && event.reason.message ? event.reason.message : String(event.reason);
        emit("runtime-error", { message: reason });
      });
      function autoScale() {
        var container = document.getElementById("heuris-stage-container");
        if (!container) return;
        container.style.transform = "none";
        container.style.marginBottom = "0px";
        var contentWidth = container.scrollWidth;
        var availableWidth = window.innerWidth - 40;
        if (contentWidth > availableWidth && availableWidth > 0) {
          var scale = availableWidth / contentWidth;
          container.style.transform = "scale(" + scale + ")";
          container.style.transformOrigin = "top center";
        }
      }
      window.addEventListener("resize", autoScale);
      autoScale();
      setTimeout(autoScale, 50);
      setTimeout(autoScale, 500);
    })();
  </script>
  <script>
    ${js}
  </script>
</body>
</html>`;
}

function sanitizeVisibleContent(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/<\/think>/gi, "")
    .trim();
}

function stringifyPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload.slice(0, 80);
  if (typeof payload === "number" || typeof payload === "boolean") return String(payload);
  try {
    return JSON.stringify(payload).slice(0, 100);
  } catch {
    return String(payload).slice(0, 100);
  }
}

function formatStageEvent(event: StageEvent): string {
  const payload = stringifyPayload(event.payload);
  return payload ? `${event.type}: ${payload}` : event.type;
}

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
  const newClassroomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  const setSessionId = useCallback(
    (id: string | null) => {
      setSessionIdState(id);
      setActiveSessionId(subject, id);
    },
    [subject],
  );

  // ── Persisted history ─────────────────────────────────────────────────────
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

  // Load existing transcript into runtime-message list when subject/session changes
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

  // On mount or subject change: hydrate sessionId from localStorage
  useEffect(() => {
    setSessionIdState(getActiveSessionId(subject));
    setArchivedSessions(getArchivedSessions());
  }, [subject]);

  // Keyboard shortcut Ctrl+L for logs
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

  // Listen to iframe stage events
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, running]);

  // Subscribe SSE while running
  useEffect(() => {
    if (!running) return;
    const stop = subscribeSse<AgentEvent>("/agent/events", (event) => {
      if (event.payload?.source !== "classroom") return;
      const ts = new Date(event.ts).toLocaleTimeString("zh-CN", { hour12: false });
      if (event.type === "tool_start") {
        pushLog({
          ts: event.ts,
          level: "info",
          message: `tool start: ${String(event.payload.toolName ?? "tool")}`,
        });
        pushHint(`调用工具 ${String(event.payload.toolName ?? "tool")}`);
      } else if (event.type === "tool_end") {
        const isError = Boolean(event.payload.isError);
        pushLog({
          ts: event.ts,
          level: isError ? "error" : "info",
          message: `tool end: ${String(event.payload.toolName ?? "tool")}`,
        });
      } else if (event.type === "task_done") {
        pushLog({ ts: event.ts, level: "info", message: "stream done" });
      } else if (event.type === "task_error") {
        pushLog({ ts: event.ts, level: "error", message: String(event.payload.error ?? "error") });
      } else if (event.type === "task_start") {
        pushLog({ ts, level: "info", message: "agent run started" });
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

  // ── Run a turn ────────────────────────────────────────────────────────────
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
        activeStage: lastLiveComponent
          ? { description: lastLiveComponent.description }
          : null,
      });
    },
    onMutate: (prompt) => {
      setRunning(true);
      setStatusHints([]);
      setDebugLogs([
        {
          ts: new Date().toISOString(),
          level: "info",
          message: "client request started",
        },
      ]);
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
      };
      setMessages((p) => [...p, agentMsg]);
      if (res.liveComponents.length > 0) {
        setSelectedTab(INTERACTIVE_TAB);
        stageEventsRef.current = [];
        setStageEvents([]);
      }
      if (res.knowledgePoints.length > 0) {
        pushHint(`知识点已记录：${res.knowledgePoints.join("、")}`);
      }
      if (res.errors.length > 0) {
        pushHint(`错题已记录 ${res.errors.length} 条`);
      }
      if (res.memorySaved > 0) {
        pushHint(`长期记忆 +${res.memorySaved}`);
      }
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

  const lastLiveComponent = useMemo(
    () => [...messages].reverse().find((m) => m.liveComponent)?.liveComponent ?? null,
    [messages],
  );

  // Auto-switch to live stage when new component appears
  useEffect(() => {
    if (lastLiveComponent && !selectedTab) {
      setSelectedTab(INTERACTIVE_TAB);
    }
  }, [lastLiveComponent, selectedTab]);

  const visibleResources = useMemo(() => {
    const items = resourcesQ.data?.items ?? [];
    return items.filter((r) =>
      ["document", "note", "knowledge-point", "exercise"].includes(r.category),
    );
  }, [resourcesQ.data]);

  const selectedResource: ResourceItem | null = useMemo(() => {
    if (!selectedTab || selectedTab === INTERACTIVE_TAB) return null;
    return visibleResources.find((r) => r.id === selectedTab) ?? null;
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
              <option key={s} value={s}>
                {s}
              </option>
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
          onClear={() => {
            saveArchivedSessions([]);
            setArchivedSessions([]);
          }}
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
        {/* Stage area (full width) */}
        <div className="absolute inset-0 flex flex-col">
          <StageHeader
            subject={subject}
            isChatOpen={isChatOpen}
            onToggleChat={() => setIsChatOpen((v) => !v)}
            onToggleLogs={() => setShowLogs((v) => !v)}
            showLogs={showLogs}
          />
          <ResourceTabs
            subject={subject}
            tabsScrollRef={tabsScrollRef}
            interactiveAvailable={Boolean(lastLiveComponent)}
            resources={visibleResources}
            selectedTab={selectedTab}
            onSelect={setSelectedTab}
            onRefresh={() => qc.invalidateQueries({ queryKey: ["classroom-resources"] })}
            loading={resourcesQ.isFetching}
          />
          <div className="relative flex-1 overflow-hidden bg-[var(--color-surface-soft)] dark:bg-[var(--color-surface-dark-soft)]">
            {selectedTab === INTERACTIVE_TAB && lastLiveComponent ? (
              <StageView component={lastLiveComponent} events={stageEvents} />
            ) : selectedResource ? (
              <ResourceView resource={selectedResource} />
            ) : (
              <EmptyStage hasComponent={Boolean(lastLiveComponent)} />
            )}
          </div>
          {showLogs && (
            <div className="border-t border-[var(--color-hairline)] bg-[var(--color-surface-dark)] dark:border-[rgba(250,249,245,0.08)]">
              <LogWindow logs={debugLogs} />
            </div>
          )}
        </div>

        {/* Chat drawer */}
        <aside
          className={cn(
            "absolute inset-y-0 right-0 z-10 flex w-full max-w-[420px] flex-col border-l border-[var(--color-hairline)] bg-[var(--color-canvas)]/95 backdrop-blur-xl transition-transform duration-300 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]/95",
            isChatOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-3 dark:border-[rgba(250,249,245,0.08)]">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-3.5 w-3.5 text-[var(--color-coral)]" strokeWidth={2} />
              <span className="text-[13px] font-medium">课堂对话</span>
            </div>
            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div ref={transcriptScrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {historyQ.isLoading && messages.length === 0 ? (
              <div className="text-center text-[12.5px] text-[var(--color-muted)]">加载历史…</div>
            ) : messages.length === 0 ? (
              <EmptyChat onPrefill={(q) => setInputValue(q)} />
            ) : (
              messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  message={m}
                  onShowStage={() => {
                    if (m.liveComponent) {
                      setSelectedTab(INTERACTIVE_TAB);
                    }
                  }}
                />
              ))
            )}
            {running && <ThinkingIndicator />}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="border-t border-[var(--color-hairline)] p-3 dark:border-[rgba(250,249,245,0.08)]"
          >
            <div className="flex items-end gap-2">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="问点什么吧… (Enter 发送, Shift+Enter 换行)"
                rows={2}
                disabled={runTurn.isPending}
                className="settings-input flex-1 resize-none py-2.5 leading-relaxed disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || runTurn.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-coral)] px-4 text-[12.5px] font-medium text-white transition hover:bg-[var(--color-coral-active)] disabled:opacity-60"
              >
                {runTurn.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" strokeWidth={2} />
                )}
              </button>
            </div>
          </form>
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

// ── Subcomponents ─────────────────────────────────────────────────────────

function StageHeader({
  subject,
  isChatOpen,
  onToggleChat,
  onToggleLogs,
  showLogs,
}: {
  subject: string;
  isChatOpen: boolean;
  onToggleChat: () => void;
  onToggleLogs: () => void;
  showLogs: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-5 py-3 dark:border-[rgba(250,249,245,0.08)]">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-[var(--color-coral)]" strokeWidth={2} />
        <div className="caption-uppercase text-[10px]">互动黑板</div>
        <span className="caption-uppercase">·</span>
        <span className="font-display text-[15px] tracking-tight text-ink dark:text-on-dark">{subject}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleLogs}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition",
            showLogs
              ? "border-[var(--color-coral)] bg-[var(--color-coral)]/10 text-[var(--color-coral-active)]"
              : "border-[var(--color-hairline)] text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]",
          )}
          title="切换运行日志 (Ctrl+L)"
        >
          <Terminal className="h-3 w-3" strokeWidth={2} />
          日志
        </button>
        <button
          type="button"
          onClick={onToggleChat}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--color-hairline)] px-2 text-[11px] text-ink transition hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:text-on-dark"
        >
          <MessageCircle className="h-3 w-3" strokeWidth={2} />
          {isChatOpen ? "收起对话" : "展开对话"}
        </button>
      </div>
    </div>
  );
}

function ResourceTabs({
  subject,
  resources,
  selectedTab,
  interactiveAvailable,
  onSelect,
  onRefresh,
  loading,
  tabsScrollRef,
}: {
  subject: string;
  resources: ResourceItem[];
  selectedTab: string | null;
  interactiveAvailable: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  loading: boolean;
  tabsScrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="border-b border-[var(--color-hairline)] px-5 py-2 dark:border-[rgba(250,249,245,0.08)]">
      <div className="flex items-center gap-2">
        <FileText className="h-3 w-3 text-[var(--color-muted)]" strokeWidth={2} />
        <span className="caption-uppercase text-[10px]">课堂资料</span>
        <span className="rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
          {subject} · {resources.length}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto grid h-6 w-6 place-items-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)] disabled:opacity-50"
          aria-label="刷新课堂资料"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} strokeWidth={2} />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            if (tabsScrollRef.current) tabsScrollRef.current.scrollLeft -= 160;
          }}
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <div
          ref={tabsScrollRef}
          className="flex flex-1 flex-nowrap gap-1.5 overflow-x-auto pb-0.5"
          style={{ scrollBehavior: "smooth", scrollbarWidth: "none" }}
        >
          {interactiveAvailable && (
            <TabButton
              active={selectedTab === INTERACTIVE_TAB}
              onClick={() => onSelect(INTERACTIVE_TAB)}
              icon={<Bot className="h-3 w-3" strokeWidth={2} />}
              label="互动黑板"
            />
          )}
          {resources.length === 0 && !loading ? (
            <span className="px-2 text-[11px] text-[var(--color-muted)]">暂无可展示的文档或笔记</span>
          ) : (
            resources.map((r) => (
              <TabButton
                key={r.id}
                active={selectedTab === r.id}
                onClick={() => onSelect(r.id)}
                label={r.title}
              />
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (tabsScrollRef.current) tabsScrollRef.current.scrollLeft += 160;
          }}
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)]"
        >
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "inline-flex max-w-[12rem] shrink-0 items-center gap-1 truncate rounded-full px-3 py-1.5 text-[11.5px] font-medium transition",
        active
          ? "bg-[var(--color-ink)] text-white shadow-sm dark:bg-[var(--color-on-dark)] dark:text-[var(--color-ink)]"
          : "bg-[var(--color-surface-soft)] text-[var(--color-body-strong)] hover:bg-[var(--color-surface-card)] dark:bg-[var(--color-surface-dark-soft)] dark:text-[var(--color-on-dark-soft)]",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function StageView({ component, events }: { component: LiveComponent; events: StageEvent[] }) {
  return (
    <div className="absolute inset-0 flex flex-col bg-[var(--color-canvas)] dark:bg-[var(--color-surface-dark)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-4 py-2 text-[11.5px] text-[var(--color-body-strong)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)] dark:text-[var(--color-on-dark-soft)]">
        <Lightbulb className="h-3 w-3 text-[var(--color-coral)]" strokeWidth={2} />
        {component.description}
      </div>
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

function ResourceView({ resource }: { resource: ResourceItem }) {
  return (
    <div className="absolute inset-0 flex flex-col bg-[var(--color-canvas)] dark:bg-[var(--color-surface-dark)]">
      <div className="border-b border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-5 py-3 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-[var(--color-coral)]" strokeWidth={2} />
          <h2 className="truncate font-display text-[16px] tracking-tight text-ink dark:text-on-dark">
            {resource.title}
          </h2>
          <span className="ml-auto rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-body-strong)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)] dark:text-[var(--color-on-dark-soft)]">
            {resource.category === "knowledge-point"
              ? "知识点"
              : resource.category === "exercise"
                ? "课堂测验"
                : resource.category === "note"
                  ? "学习笔记"
                  : "文档资料"}
          </span>
        </div>
        {resource.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {resource.tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-2 py-0.5 font-mono text-[9.5px] text-[var(--color-muted)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="prose prose-sm flex-1 overflow-y-auto px-6 py-5 dark:prose-invert max-w-none [&_pre]:bg-[var(--color-surface-soft)] dark:[&_pre]:bg-[var(--color-surface-dark-soft)]">
        {resource.content ? (
          <Markdown>{resource.content}</Markdown>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">该资料暂未填写正文内容。</p>
        )}
        {resource.file_url && (
          <a
            href={resource.file_url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-[12px] text-[var(--color-coral-active)] hover:underline"
          >
            打开关联文件 →
          </a>
        )}
      </div>
    </div>
  );
}

function EmptyStage({ hasComponent }: { hasComponent: boolean }) {
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

function EmptyChat({ onPrefill }: { onPrefill: (q: string) => void }) {
  const quickQuestions = [
    "请解释一下这个知识点的核心概念",
    "能举一个生活中的例子吗？",
    "这个知识点和之前学过的有什么联系？",
    "帮我梳理一下这部分的知识框架",
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[var(--color-coral)]/10 text-[var(--color-coral-active)]">
        <Bot className="h-7 w-7" strokeWidth={1.75} />
      </div>
      <h3 className="mt-3 font-display text-[18px] tracking-tight text-ink dark:text-on-dark">
        课堂互动智能体
      </h3>
      <p className="mt-1 max-w-xs text-[12.5px] text-[var(--color-muted)]">
        我会实时讲解、生成黑板演示、记录错题与长期记忆。
      </p>
      <div className="mt-5 grid w-full gap-2">
        {quickQuestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPrefill(q)}
            className="flex items-center gap-2 rounded-md border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-2 text-left text-[12.5px] text-[var(--color-body)] transition hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)] dark:text-[var(--color-on-dark-soft)]"
          >
            <Lightbulb className="h-3 w-3 shrink-0 text-[var(--color-coral)]" strokeWidth={2} />
            <span className="truncate">{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-coral)]/15 text-[var(--color-coral-active)]">
        <Bot className="h-4 w-4" strokeWidth={2} />
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-[var(--color-surface-soft)] px-4 py-2.5 text-[12.5px] text-[var(--color-muted)] dark:bg-[var(--color-surface-dark-soft)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        智能体正在思考…
      </div>
    </div>
  );
}

function ChatBubble({
  message,
  onShowStage,
}: {
  message: RuntimeMessage;
  onShowStage: () => void;
}) {
  const isStudent = message.role === "student";
  const visible = isStudent ? message.content : sanitizeVisibleContent(message.content);
  return (
    <div className={cn("flex items-start gap-3", isStudent && "flex-row-reverse")}>
      <div
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-full",
          isStudent
            ? "bg-[var(--color-ink)] text-white dark:bg-[var(--color-on-dark)] dark:text-[var(--color-ink)]"
            : "bg-[var(--color-coral)]/15 text-[var(--color-coral-active)]",
        )}
      >
        {isStudent ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" strokeWidth={2} />}
      </div>
      <div className={cn("flex max-w-[82%] flex-col gap-1.5", isStudent && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-[14px] leading-[1.65]",
            isStudent
              ? "whitespace-pre-wrap bg-[var(--color-ink)] text-white dark:bg-[var(--color-on-dark)] dark:text-[var(--color-ink)]"
              : "prose prose-sm dark:prose-invert max-w-none bg-[var(--color-surface-soft)] text-[var(--color-body-strong)] dark:bg-[var(--color-surface-dark-soft)] dark:text-on-dark [&_p]:my-1.5 [&_pre]:bg-[var(--color-canvas)] [&_pre]:text-[12px] dark:[&_pre]:bg-[var(--color-surface-dark-elev)]",
          )}
        >
          {visible ? (
            isStudent ? (
              visible
            ) : (
              <Markdown>{visible}</Markdown>
            )
          ) : (
            <span className="text-[var(--color-muted)]">本轮没有可见文本，结果已写入工具调用。</span>
          )}
        </div>
        {message.toolCalls.length > 0 && <ToolCallTimeline calls={message.toolCalls} />}
        {message.knowledgePoints && message.knowledgePoints.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--color-muted)]">
            <Sparkles className="h-2.5 w-2.5 text-[var(--color-coral)]" />
            知识点：{message.knowledgePoints.join("、")}
          </span>
        )}
        {message.liveComponent && (
          <button
            type="button"
            onClick={onShowStage}
            className="inline-flex items-center gap-1.5 self-start rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-2.5 py-0.5 text-[10.5px] font-medium text-[var(--color-body-strong)] transition hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)] dark:text-[var(--color-on-dark-soft)]"
          >
            <Layers className="h-2.5 w-2.5 text-[var(--color-coral)]" strokeWidth={2} />
            打开互动黑板
          </button>
        )}
        <span className="px-1 text-[10px] text-[var(--color-muted)]">
          {new Date(message.ts).toLocaleTimeString("zh-CN", { hour12: false })}
        </span>
      </div>
    </div>
  );
}

function ToolCallTimeline({ calls }: { calls: ToolCallView[] }) {
  if (!calls || calls.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[10px] font-medium text-[var(--color-muted)]">
        <Wrench className="h-2.5 w-2.5" strokeWidth={2} />
        工具调用 ({calls.length})
      </div>
      <div className="flex flex-wrap gap-1">
        {calls.map((call, i) => (
          <span
            key={`${call.name}-${i}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-mono",
              call.isError
                ? "border-[var(--color-coral)]/40 bg-[var(--color-coral)]/10 text-[var(--color-coral-active)]"
                : "border-[var(--color-hairline)] bg-[var(--color-canvas)] text-[var(--color-body-strong)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)] dark:text-[var(--color-on-dark-soft)]",
            )}
          >
            {call.isError ? <XCircle className="h-2.5 w-2.5" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
            {call.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function LogWindow({ logs }: { logs: DebugLog[] }) {
  return (
    <div className="flex max-h-[160px] flex-col overflow-hidden text-[var(--color-on-dark)]">
      <div className="flex items-center gap-2 border-b border-[rgba(250,249,245,0.08)] px-3 py-1.5 text-[11px]">
        <Terminal className="h-3 w-3 text-[var(--accent-teal,#5db8a6)]" />
        <span className="font-medium">运行日志</span>
        <span className="ml-auto text-[10px] text-[var(--color-on-dark-soft)]">{logs.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[10.5px] leading-relaxed">
        {logs.length === 0 ? (
          <div className="text-[var(--color-on-dark-soft)]">waiting for stream…</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="border-b border-[rgba(250,249,245,0.04)] py-0.5 last:border-0">
              <span className="text-[var(--color-on-dark-soft)]">
                {new Date(log.ts).toLocaleTimeString("zh-CN", { hour12: false })}
              </span>{" "}
              <span
                className={cn(
                  log.level === "error"
                    ? "text-[#e88e8e]"
                    : log.level === "warn"
                      ? "text-[#e8c47a]"
                      : "text-[#9bd1a8]",
                )}
              >
                {log.level.toUpperCase()}
              </span>{" "}
              <span>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ArchivedSessionList({
  sessions,
  onResume,
  onClear,
}: {
  sessions: ArchivedSession[];
  onResume: (s: ArchivedSession) => void;
  onClear: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-4 py-2 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
        <History className="h-3.5 w-3.5 text-[var(--color-coral)]" strokeWidth={2} />
        <span className="text-[12.5px] font-medium">历史课堂</span>
        <span className="ml-auto text-[11px] text-[var(--color-muted)]">{sessions.length} 条</span>
        {sessions.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-[var(--color-hairline)] px-2 py-0.5 text-[10.5px] text-[var(--color-muted)] hover:bg-[var(--color-canvas)] dark:border-[rgba(250,249,245,0.08)]"
          >
            清空
          </button>
        )}
      </div>
      {sessions.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-[var(--color-muted)]">暂无归档课堂</p>
      ) : (
        <div className="max-h-52 overflow-y-auto divide-y divide-[var(--color-hairline)] dark:divide-[rgba(250,249,245,0.06)]">
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              type="button"
              onClick={() => onResume(s)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--color-surface-soft)] dark:hover:bg-[var(--color-surface-dark-soft)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink dark:text-on-dark">{s.title}</p>
                <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                  {new Date(s.archivedAt).toLocaleString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {s.messageCount} 条消息
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-[10px] text-[var(--color-body-strong)] dark:border-[rgba(250,249,245,0.08)] dark:text-[var(--color-on-dark-soft)]">
                {s.subject}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
