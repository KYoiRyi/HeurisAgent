"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquareText, Send, Bot, User, Sparkles,
  Lightbulb, Loader2, FileText, RefreshCw, Wrench, CheckCircle2, XCircle, Terminal,
  ChevronLeft, ChevronRight, PlusCircle, History, BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Archived session (stored in localStorage) ────────────────────────────────
interface ArchivedSession {
  sessionId: string;
  subject: string;
  title: string;        // auto-generated from first user message
  archivedAt: string;   // ISO timestamp
  messageCount: number;
}

const LS_ACTIVE_SESSION = (subject: string) => `heuris-active-session:${subject}`;
const LS_SESSIONS_LIST  = "heuris-archived-sessions";

function getArchivedSessions(): ArchivedSession[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LS_SESSIONS_LIST) ?? "[]"); } catch { return []; }
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

interface LiveComponent {
  html: string;
  css?: string;
  js?: string;
  description: string;
}

interface Message {
  id: string;
  role: "student" | "agent";
  content: string;
  timestamp: Date;
  type?: string;
  liveComponent?: LiveComponent | null;
  toolCalls?: ToolCallView[];
}

interface ToolCallView {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  args?: unknown;
  result?: unknown;
  startedAt?: string;
  endedAt?: string;
}

interface ClassroomResource {
  id: string;
  title: string;
  subject: string;
  category: string;
  content: string | null;
  file_url?: string | null;
  tags?: string[];
  difficulty?: string;
}

interface ClassroomHistoryItem {
  id: string;
  session_id: string | null;
  subject: string;
  role: "student" | "agent";
  content: string;
  created_at: string;
  live_component?: LiveComponent | null;
  tool_calls?: ToolCallView[];
}

interface StageEvent {
  id: string;
  type: string;
  payload: unknown;
  ts: string;
  description?: string;
}

interface StageMessage {
  type?: unknown;
  eventType?: unknown;
  payload?: unknown;
  description?: unknown;
}

interface ClassroomStreamEvent {
  content?: string;
  replaceContent?: string;
  liveComponent?: LiveComponent;
  toolCall?: ToolCallView;
  status?: string;
  knowledgeSaved?: { points?: string[] };
  memorySaved?: unknown;
  errorSaved?: unknown;
  stageSaved?: boolean;
  resourceSaved?: unknown;
  log?: DebugLog;
  done?: boolean;
  error?: string;
}

interface DebugLog {
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
  details?: unknown;
}

const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "通用"];

declare global {
  interface Window {
    HeurisStage?: {
      emit: (type: string, payload?: unknown) => void;
      answer: (payload?: unknown) => void;
      progress: (payload?: unknown) => void;
    };
  }
}

function buildStageSrcDoc(component: LiveComponent): string {
  const description = JSON.stringify(component.description || "互动黑板");
  const css = component.css || "";
  const js = (component.js || "").replace(/<\/script/gi, "<\\/script");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        html, body { margin: 0; padding: 0; min-height: 100vh; }
        body { 
          font-family: system-ui, -apple-system, sans-serif; 
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          padding: 1rem;
        }
        #heuris-stage-container {
          margin: auto;
          max-width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        /* AI custom CSS below */
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
            emit("runtime-error", {
              message: event.message,
              line: event.lineno,
              column: event.colno
            });
          });
          window.addEventListener("unhandledrejection", function (event) {
            emit("runtime-error", {
              message: event.reason && event.reason.message ? event.reason.message : String(event.reason)
            });
          });
        })();
      </script>
      <script>
        ${js}
      </script>
    </body>
    </html>
  `;
}

function sanitizeVisibleContent(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/<\/think>/gi, "")
    .trim();
}

function formatStageEvent(event: StageEvent): string {
  const payload = stringifyPayload(event.payload);
  return payload ? `${event.type}: ${payload}` : event.type;
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

function stringifyToolPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "number" || typeof payload === "boolean") return String(payload);
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function upsertToolCall(calls: ToolCallView[] | undefined, nextCall: ToolCallView): ToolCallView[] {
  const existing = calls ?? [];
  const index = existing.findIndex((call) => call.id === nextCall.id);
  if (index === -1) return [...existing, nextCall];
  return existing.map((call, itemIndex) =>
    itemIndex === index ? { ...call, ...nextCall } : call
  );
}

function toolStatusLabel(status: ToolCallView["status"]): string {
  if (status === "running") return "运行中";
  if (status === "error") return "失败";
  return "完成";
}

function toolStatusClass(status: ToolCallView["status"]): string {
  if (status === "running") return "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300";
  if (status === "error") return "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300";
  return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300";
}

function logLevelClass(level: DebugLog["level"]): string {
  if (level === "error") return "text-red-500";
  if (level === "warn") return "text-amber-500";
  return "text-emerald-500";
}

function formatLogTime(ts: string): string {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour12: false });
}

function LogWindow({ logs }: { logs: DebugLog[] }) {
  return (
    <div className="flex h-full min-h-[8rem] flex-col overflow-hidden rounded-md border bg-neutral-950 text-neutral-100">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2 text-xs">
        <Terminal className="h-3.5 w-3.5 text-emerald-400" />
        <span className="font-semibold">运行日志</span>
        <span className="ml-auto text-[10px] text-neutral-400">{logs.length}</span>
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed">
        {logs.length === 0 ? (
          <div className="text-neutral-500">waiting for stream...</div>
        ) : (
          logs.map((log, index) => (
            <details key={`${log.ts}-${index}`} className="group border-b border-neutral-900 py-1 last:border-0">
              <summary className="cursor-pointer list-none">
                <span className="text-neutral-500">{formatLogTime(log.ts)}</span>{" "}
                <span className={logLevelClass(log.level)}>{log.level.toUpperCase()}</span>{" "}
                <span>{log.message}</span>
              </summary>
              {log.details !== undefined && (
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-neutral-900 p-2 text-neutral-300">
                  {stringifyToolPayload(log.details)}
                </pre>
              )}
            </details>
          ))
        )}
      </div>
    </div>
  );
}

function ToolCallTimeline({ calls }: { calls?: ToolCallView[] }) {
  if (!calls || calls.length === 0) return null;

  return (
    <div className="not-prose mt-3 space-y-2 rounded-lg border bg-muted/30 p-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <Wrench className="h-3 w-3" />
        工具调用
      </div>
      {calls.map((call) => {
        const args = stringifyToolPayload(call.args);
        const result = stringifyToolPayload(call.result);

        return (
          <div key={call.id} className={`rounded-md border px-2 py-1.5 text-[11px] ${toolStatusClass(call.status)}`}>
            <div className="flex items-center gap-1.5">
              {call.status === "running" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : call.status === "error" ? (
                <XCircle className="h-3 w-3" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              <span className="font-mono font-semibold">{call.name}</span>
              <span className="ml-auto rounded-sm border bg-background/60 px-1.5 py-0.5">
                {toolStatusLabel(call.status)}
              </span>
            </div>
            {(args || result) && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] opacity-80">参数 / 结果</summary>
                {args && (
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background/70 p-2 font-mono text-[10px]">
                    {args}
                  </pre>
                )}
                {result && (
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background/70 p-2 font-mono text-[10px]">
                    {result}
                  </pre>
                )}
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ClassroomPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("物理");
  const [classroomResources, setClassroomResources] = useState<ClassroomResource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [stageEvents, setStageEvents] = useState<StageEvent[]>([]);
  const [statusHints, setStatusHints] = useState<string[]>([]);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [exerciseAnswers, setExerciseAnswers] = useState<Record<string, string>>({});
  const [exerciseProcesses, setExerciseProcesses] = useState<Record<string, string>>({});
  const [newClassroomArmed, setNewClassroomArmed] = useState(false);
  const [archivedSessions, setArchivedSessions] = useState<ArchivedSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const newClassroomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageEventsRef = useRef<StageEvent[]>([]);
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  const fetchClassroomResources = useCallback(async () => {
    setResourcesLoading(true);
    try {
      const res = await fetch(`/api/resources?subject=${encodeURIComponent(selectedSubject)}`);
      const json = await res.json();
      if (json.success) {
        const docs = (json.data || []).filter((resource: ClassroomResource) =>
          resource.category === "document" ||
          resource.category === "note" ||
          resource.category === "knowledge-point" ||
          resource.category === "exercise"
        );
        setClassroomResources(docs);
        setSelectedResourceId((current) => {
          if (current === "interactive-stage") return current;
          return docs.some((resource: ClassroomResource) => resource.id === current)
            ? current
            : docs[0]?.id ?? null;
        });
      }
    } catch (err) {
      console.error("Fetch classroom resources error:", err);
    } finally {
      setResourcesLoading(false);
    }
  }, [selectedSubject]);

  const fetchClassroomHistory = useCallback(async (overrideSessionId?: string | null) => {
    try {
      const sid = overrideSessionId !== undefined ? overrideSessionId : getActiveSessionId(selectedSubject);
      let url = `/api/classroom/history?subject=${encodeURIComponent(selectedSubject)}`;
      if (sid) url += `&sessionId=${encodeURIComponent(sid)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.success) return;

      const rows = (json.data || []) as ClassroomHistoryItem[];
      setMessages(rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        timestamp: new Date(row.created_at),
        type: row.role === "student" ? "question" : "answer",
        liveComponent: row.live_component ?? null,
        toolCalls: row.tool_calls ?? [],
      })));

      // Restore the persisted sessionId if we have one
      if (sid) {
        setSessionId(sid);
      } else {
        const latestSession = [...rows].reverse().find((row) => row.session_id)?.session_id ?? null;
        if (latestSession) {
          setSessionId(latestSession);
          setActiveSessionId(selectedSubject, latestSession);
        }
      }
      stageEventsRef.current = [];
      setStageEvents([]);
    } catch (err) {
      console.error("Fetch classroom history error:", err);
    }
  }, [selectedSubject]);

  useEffect(() => {
    fetchClassroomResources();
  }, [fetchClassroomResources]);

  // On mount / subject change: restore sessionId from localStorage, then fetch matching history
  useEffect(() => {
    setArchivedSessions(getArchivedSessions());
    void fetchClassroomHistory();
  }, [fetchClassroomHistory]);

  const pushStatusHint = useCallback((hint: string) => {
    setStatusHints((prev) => [...prev, hint].slice(-6));
  }, []);

  const appendLog = useCallback((log: DebugLog) => {
    setDebugLogs((prev) => [...prev, log].slice(-160));
  }, []);

  useEffect(() => {
    const handleStageMessage = (event: MessageEvent) => {
      const data = event.data as StageMessage;
      if (!data || data.type !== "heuris-stage-event") return;
      const eventType = typeof data.eventType === "string" && data.eventType.trim()
        ? data.eventType.trim()
        : "event";
      const description = typeof data.description === "string" ? data.description : undefined;
      const nextEvent: StageEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: eventType,
        payload: data.payload ?? null,
        ts: new Date().toISOString(),
        description,
      };

      setStageEvents((prev) => {
        const next = [...prev, nextEvent].slice(-20);
        stageEventsRef.current = next;
        return next;
      });
    };

    window.addEventListener("message", handleStageMessage);
    return () => window.removeEventListener("message", handleStageMessage);
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleCreateSession = async () => {
    const newId = "local-" + Date.now().toString();
    setSessionId(newId);
    setActiveSessionId(selectedSubject, newId);
    return newId;
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

    // Archive current session before clearing
    if (sessionId && messages.length > 0) {
      const firstUserMsg = messages.find(m => m.role === "student");
      const title = firstUserMsg
        ? firstUserMsg.content.replace(/\[EXERCISE_SUBMISSION\][\s\S]*/, "").trim().slice(0, 40) || "课堂记录"
        : `${selectedSubject} 课堂 ${new Date().toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
      const archive: ArchivedSession = {
        sessionId,
        subject: selectedSubject,
        title,
        archivedAt: new Date().toISOString(),
        messageCount: messages.length,
      };
      const updated = [archive, ...getArchivedSessions().filter(s => s.sessionId !== sessionId)];
      saveArchivedSessions(updated);
      setArchivedSessions(updated);
    }

    // Clear active session from localStorage so refresh shows empty classroom
    setActiveSessionId(selectedSubject, null);

    // Reset all classroom state
    setMessages([]);
    setStageEvents([]);
    stageEventsRef.current = [];
    setStatusHints([]);
    setDebugLogs([]);
    setExerciseAnswers({});
    setExerciseProcesses({});
    setSelectedResourceId(null);
    setInputValue("");
    setIsStreaming(false);

    // Fresh session
    const freshId = "local-" + Date.now().toString();
    setSessionId(freshId);
    setActiveSessionId(selectedSubject, freshId);
    void fetchClassroomResources();
  };

  // Resume an archived session
  const handleResumeSession = (archived: ArchivedSession) => {
    setShowHistory(false);
    setActiveSessionId(archived.subject, archived.sessionId);
    setSelectedSubject(archived.subject);
    // fetchClassroomHistory will re-run due to selectedSubject change (or call directly)
    void fetchClassroomHistory(archived.sessionId);
  };

  const activeComponent = [...messages].reverse().find(m => m.liveComponent)?.liveComponent;
  const selectedResource = classroomResources.find((resource) => resource.id === selectedResourceId) ?? null;

  const previousActiveComponentRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeComponent && activeComponent.html !== previousActiveComponentRef.current) {
      setSelectedResourceId("interactive-stage");
      previousActiveComponentRef.current = activeComponent.html;
    }
  }, [activeComponent]);

  const handleSend = async (overrideMessage?: string) => {
    if (!inputValue.trim() && typeof overrideMessage !== "string") return;
    if (isStreaming) return;

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      activeSessionId = await handleCreateSession();
      if (!activeSessionId) {
        console.error("Failed to create session automatically");
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "student",
      content: typeof overrideMessage === "string" ? overrideMessage : inputValue.trim(),
      timestamp: new Date(),
      type: "question",
    };

    setMessages((prev) => [...prev, userMessage]);
    if (typeof overrideMessage !== "string") setInputValue("");
    setIsStreaming(true);
    setStatusHints([]);
    setDebugLogs([
      {
        ts: new Date().toISOString(),
        level: "info",
        message: "client request started",
        details: { subject: selectedSubject, sessionId: activeSessionId, message: userMessage.content },
      },
    ]);

    const agentMessageId = (Date.now() + 1).toString();
    const agentMessage: Message = {
      id: agentMessageId,
      role: "agent",
      content: "",
      timestamp: new Date(),
      type: "answer",
    };
    setMessages((prev) => [...prev, agentMessage]);

    try {
      const response = await fetch("/api/classroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId: activeSessionId,
          subject: selectedSubject,
          stageEvents: stageEventsRef.current.slice(-12),
          activeStage: selectedResourceId === "interactive-stage" && activeComponent
            ? { description: activeComponent.description }
            : selectedResource
              ? { description: `课堂资料：${selectedResource.title}` }
              : null,
        }),
      });

      if (!response.ok) throw new Error("请求失败");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("无法读取响应流");

      let buffer = "";
      let fullContent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim().startsWith("data: ")) {
            try {
              const data = JSON.parse(line.trim().slice(6)) as ClassroomStreamEvent;
              if (typeof data.replaceContent === "string") {
                fullContent = data.replaceContent;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === agentMessageId ? { ...m, content: fullContent } : m
                  )
                );
              }
              if (data.log) {
                appendLog(data.log);
              }
              if (data.toolCall) {
                appendLog({
                  ts: new Date().toISOString(),
                  level: data.toolCall.status === "error" ? "error" : "info",
                  message: `tool ${data.toolCall.status}: ${data.toolCall.name}`,
                  details: data.toolCall,
                });
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === agentMessageId
                      ? { ...m, toolCalls: upsertToolCall(m.toolCalls, data.toolCall!) }
                      : m
                  )
                );
              }
              if (data.content !== undefined || data.liveComponent !== undefined) {
                if (data.content) fullContent += data.content;
                if (data.liveComponent) {
                  stageEventsRef.current = [];
                  setStageEvents([]);
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === agentMessageId
                      ? { ...m, content: fullContent, liveComponent: data.liveComponent || m.liveComponent }
                      : m
                  )
                );
              }
              if (data.done) {
                appendLog({ ts: new Date().toISOString(), level: "info", message: "stream done" });
                setIsStreaming(false);
                void fetchClassroomResources();
              }
              if (typeof data.status === "string") {
                appendLog({ ts: new Date().toISOString(), level: "info", message: data.status });
                pushStatusHint(data.status);
              }
              if (data.knowledgeSaved?.points?.length) {
                pushStatusHint(`知识点已记录：${data.knowledgeSaved.points.join("、")}`);
              }
              if (data.memorySaved) {
                pushStatusHint("学习记忆已更新");
              }
              if (data.errorSaved) {
                pushStatusHint("错题/误区已记录");
              }
              if (data.stageSaved) {
                pushStatusHint("黑板结果已记录");
              }
              if (data.resourceSaved) {
                pushStatusHint("知识点资料已保存");
                void fetchClassroomResources();
              }
              if (data.error) {
                appendLog({ ts: new Date().toISOString(), level: "error", message: data.error });
                fullContent += `\n\n[错误: ${data.error}]`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === agentMessageId ? { ...m, content: fullContent } : m
                  )
                );
                setIsStreaming(false);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "未知错误";
      appendLog({ ts: new Date().toISOString(), level: "error", message: `client request failed: ${errMsg}` });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMessageId
            ? { ...m, content: `抱歉，请求出错：${errMsg}` }
            : m
        )
      );
      setIsStreaming(false);
    }
  };

  const quickQuestions = [
    "请解释一下这个知识点的核心概念",
    "能举一个生活中的例子吗？",
    "这个知识点和之前学过的有什么联系？",
    "帮我梳理一下这部分的知识框架",
  ];

  return (
    <div className="space-y-4 h-[calc(100vh-6rem)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0 mb-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <MessageSquareText className="h-8 w-8 text-emerald-500" />
            课堂互动智能体
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedSubject} onValueChange={setSelectedSubject} disabled={isStreaming}>
            <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUBJECTS.map((subject) => <SelectItem key={subject} value={subject}>{subject}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="h-8 gap-1.5 px-3">
            <Sparkles className="h-3.5 w-3.5" />
            只存知识点
          </Badge>
          <Button
            size="sm"
            variant={showLogs ? "secondary" : "outline"}
            onClick={() => setShowLogs((value) => !value)}
          >
            <Terminal className="h-3.5 w-3.5 mr-1" />日志
          </Button>
          <Button
            size="sm"
            variant={showHistory ? "secondary" : "outline"}
            onClick={() => setShowHistory(v => !v)}
            title="历史课堂记录"
          >
            <History className="h-3.5 w-3.5 mr-1" />
            历史课堂
            {archivedSessions.length > 0 && (
              <span className="ml-1 rounded-full bg-emerald-500 text-white text-[9px] px-1 leading-4">
                {archivedSessions.length}
              </span>
            )}
          </Button>
          <Button
            size="sm"
            variant={newClassroomArmed ? "destructive" : "outline"}
            onClick={handleNewClassroom}
            disabled={isStreaming}
            title={newClassroomArmed ? "再次点击确认清空，开启全新课堂" : "清空聊天记录，开启新课堂"}
          >
            <PlusCircle className="h-3.5 w-3.5 mr-1" />
            {newClassroomArmed ? "确认清空？" : "新课堂"}
          </Button>
          <Button
            size="sm"
            variant={sessionId ? "outline" : "default"}
            onClick={handleCreateSession}
          >
            {sessionId ? (
              <><Sparkles className="h-3.5 w-3.5 mr-1" />课堂进行中</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1" />开始课堂</>
            )}
          </Button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="shrink-0 rounded-xl border bg-background shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
            <BookOpen className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold">历史课堂记录</span>
            <span className="ml-auto text-xs text-muted-foreground">{archivedSessions.length} 条</span>
          </div>
          {archivedSessions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">暂无归档课堂</p>
          ) : (
            <div className="divide-y max-h-52 overflow-y-auto">
              {archivedSessions.map((s) => (
                <button
                  key={s.sessionId}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => handleResumeSession(s)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(s.archivedAt).toLocaleString("zh-CN", {
                        month: "numeric", day: "numeric",
                        hour: "2-digit", minute: "2-digit"
                      })} · {s.messageCount} 条消息
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{s.subject}</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {statusHints.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {statusHints.map((hint, index) => (
            <Badge key={`${hint}-${index}`} variant="secondary" className="h-6 px-2 text-[11px]">
              <Sparkles className="h-3 w-3 mr-1" />
              {hint}
            </Badge>
          ))}
        </div>
      )}


      {/* Main Split Layout */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 rounded-lg border">
        {/* Stage Pane */}
        <ResizablePanel defaultSize={50} minSize={30} className="bg-background flex flex-col relative">
          <div className="flex items-center p-3 border-b shrink-0 bg-muted/30">
            <Bot className="h-4 w-4 mr-2 text-emerald-500" />
            <span className="text-sm font-semibold">互动黑板</span>
          </div>
          <div className="border-b bg-background/80 px-3 py-2 shrink-0 min-w-0 w-full overflow-hidden">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-cyan-500" />
              <span className="text-xs font-semibold">课堂资料</span>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                {selectedSubject} · {classroomResources.length}
              </Badge>
              <button
                onClick={fetchClassroomResources}
                disabled={resourcesLoading}
                className="ml-auto p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                aria-label="刷新课堂资料"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${resourcesLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1">
              <button
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="向左滚动"
                onClick={() => { if (tabsScrollRef.current) tabsScrollRef.current.scrollLeft -= 160; }}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div
                ref={tabsScrollRef}
                className="flex flex-1 flex-nowrap gap-1.5 overflow-x-auto pb-1"
                style={{ scrollBehavior: "smooth", scrollbarWidth: "none" }}
              >
                {activeComponent && (
                  <button
                    onClick={() => setSelectedResourceId("interactive-stage")}
                    className={`max-w-[12rem] shrink-0 truncate rounded-md border px-2 py-1 text-[11px] transition-colors ${
                      selectedResourceId === "interactive-stage"
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-border text-muted-foreground hover:border-emerald-500/40 hover:text-foreground"
                    }`}
                    title="互动黑板"
                  >
                    <Bot className="inline-block h-3 w-3 mr-1" />
                    互动黑板
                  </button>
                )}
                {resourcesLoading && classroomResources.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">正在加载资料...</span>
                ) : classroomResources.length > 0 ? (
                  classroomResources.map((resource) => (
                    <button
                      key={resource.id}
                      onClick={() => setSelectedResourceId(resource.id)}
                      className={`max-w-[12rem] shrink-0 truncate rounded-md border px-2 py-1 text-[11px] transition-colors ${
                        selectedResourceId === resource.id
                          ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                          : "border-border text-muted-foreground hover:border-cyan-500/40 hover:text-foreground"
                      }`}
                      title={resource.title}
                    >
                      {resource.title}
                    </button>
                  ))
                ) : (
                  <span className="text-[11px] text-muted-foreground">暂无可展示的文档或笔记</span>
                )}
              </div>
              <button
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="向右滚动"
                onClick={() => { if (tabsScrollRef.current) tabsScrollRef.current.scrollLeft += 160; }}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden bg-dot-pattern">
            {selectedResourceId === "interactive-stage" && activeComponent ? (
              <div className="absolute inset-0 flex flex-col bg-white overflow-hidden">
                <div className="px-4 py-2 bg-muted border-b text-xs text-muted-foreground flex items-center shrink-0">
                  <Lightbulb className="h-3 w-3 mr-1" />
                  {activeComponent.description}
                </div>
                <iframe
                  className="flex-1 w-full border-0 min-h-0"
                  srcDoc={buildStageSrcDoc(activeComponent)}
                  sandbox="allow-scripts allow-same-origin"
                />
                {stageEvents.length > 0 && (
                  <div className="border-t bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3 w-3 text-emerald-500" />
                      <span className="font-medium text-foreground">交互结果</span>
                    </div>
                    <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
                      {stageEvents.slice(-4).map((event) => (
                        <span
                          key={event.id}
                          className="max-w-[16rem] shrink-0 truncate rounded-md border bg-background px-2 py-1"
                          title={formatStageEvent(event)}
                        >
                          {formatStageEvent(event)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : selectedResource ? (
              <div className="absolute inset-0 flex flex-col bg-background overflow-hidden">
                <div className="border-b bg-muted px-4 py-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-cyan-500" />
                    <h2 className="text-sm font-semibold truncate">{selectedResource.title}</h2>
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {selectedResource.category === "knowledge-point"
                        ? "知识点"
                        : selectedResource.category === "exercise"
                          ? "课堂测验"
                          : selectedResource.category === "note"
                            ? "学习笔记"
                            : "文档资料"}
                    </Badge>
                  </div>
                  {selectedResource.tags && selectedResource.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selectedResource.tags.slice(0, 5).map((tag) => (
                        <Badge key={tag} variant="outline" className="h-4 px-1 text-[9px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {selectedResource.category === "exercise" ? (
                  /* exercise: question above, answer form below */
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="overflow-y-auto p-5 border-b prose prose-sm dark:prose-invert max-w-none flex-none" style={{ maxHeight: "55%" }}>
                      {selectedResource.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedResource.content}</ReactMarkdown>
                      ) : (
                        <p className="text-sm text-muted-foreground">题目内容加载中...</p>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 not-prose bg-muted/20">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-semibold">答题区</span>
                        <Badge variant="outline" className="text-[10px]">答完后提交，AI 自动批改并录入错题本</Badge>
                      </div>
                      {/^[A-D][.。]\s/m.test(selectedResource.content ?? "") ? (
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground block">选择答案：</label>
                          <div className="grid grid-cols-2 gap-2">
                            {["A", "B", "C", "D"].map((opt) => (
                              <button
                                key={opt}
                                onClick={() => setExerciseAnswers((prev) => ({ ...prev, [selectedResource.id]: opt }))}
                                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors text-left ${
                                  exerciseAnswers[selectedResource.id] === opt
                                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                                    : "border-border hover:border-cyan-400 hover:bg-accent"
                                }`}
                              >{opt}</button>
                            ))}
                          </div>
                          <label className="text-xs text-muted-foreground block mt-2">解题思路（可选）：</label>
                          <textarea
                            className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            placeholder="说说你为什么选这个选项..."
                            value={exerciseProcesses[selectedResource.id] || ""}
                            onChange={(e) => setExerciseProcesses((prev) => ({ ...prev, [selectedResource.id]: e.target.value }))}
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground block">我的答案：</label>
                          <Input
                            placeholder="请输入最终答案..."
                            value={exerciseAnswers[selectedResource.id] || ""}
                            onChange={(e) => setExerciseAnswers((prev) => ({ ...prev, [selectedResource.id]: e.target.value }))}
                          />
                          <label className="text-xs text-muted-foreground block">解题过程/思路：</label>
                          <textarea
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            placeholder="请完整写出解题过程..."
                            value={exerciseProcesses[selectedResource.id] || ""}
                            onChange={(e) => setExerciseProcesses((prev) => ({ ...prev, [selectedResource.id]: e.target.value }))}
                          />
                        </div>
                      )}
                      <Button
                        className="w-full"
                        onClick={() => {
                          const ans = exerciseAnswers[selectedResource.id] || "";
                          const proc = exerciseProcesses[selectedResource.id] || "";
                          if (!ans && !proc) return;
                          handleSend(
                            `[EXERCISE_SUBMISSION]\n\n题目：《${selectedResource.title}》\n\n题目内容：\n${selectedResource.content ?? ""}\n\n【我的答案】\n${ans}\n\n【解题过程/思路】\n${proc}\n\n请批改，并将结果录入错题本。`
                          );
                        }}
                        disabled={(!exerciseAnswers[selectedResource.id] && !exerciseProcesses[selectedResource.id]) || isStreaming}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        提交批改（自动录入错题本）
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto p-5 prose prose-sm dark:prose-invert max-w-none">
                    {selectedResource.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedResource.content}</ReactMarkdown>
                    ) : (
                      <p className="text-sm text-muted-foreground">该资料暂未填写正文内容。</p>
                    )}
                    {selectedResource.file_url && (
                      <a href={selectedResource.file_url} target="_blank" rel="noreferrer" className="text-xs">打开关联文件</a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground opacity-50">
                <MessageSquareText className="h-16 w-16 mx-auto mb-4" />
                <p>智能互动黑板将在此展示</p>
                <p className="text-xs mt-2">模型可生成实验、测验、图表，并读取你的操作结果</p>
              </div>
            )}
          </div>
          {showLogs && (
            <div className="border-t bg-background p-3">
              <LogWindow logs={debugLogs} />
            </div>
          )}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Chat Pane */}
        <ResizablePanel defaultSize={50} minSize={30} className="flex flex-col bg-muted/10">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 mb-4">
                  <Bot className="h-8 w-8 text-emerald-500" />
                </div>
                <h3 className="text-lg font-semibold">课堂互动智能体</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  我是你的课堂助教，可以实时解答问题、联动讲解知识点、并在黑板上生成交互式演示。
                </p>
                <div className="grid grid-cols-1 gap-2 mt-6 w-full max-w-sm">
                  {quickQuestions.map((q) => (
                    <Button
                      key={q}
                      variant="outline"
                      size="sm"
                      className="justify-start text-xs h-auto py-2"
                      onClick={() => { setInputValue(q); }}
                    >
                      <Lightbulb className="h-3 w-3 mr-1.5 text-amber-500 shrink-0" />
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => {
                  const visibleContent = msg.role === "agent" ? sanitizeVisibleContent(msg.content) : msg.content;
                  const isPendingAgentMessage =
                    msg.role === "agent" &&
                    isStreaming &&
                    msg.id === messages[messages.length - 1]?.id;

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${msg.role === "student" ? "flex-row-reverse" : ""}`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-1 ${
                        msg.role === "student"
                          ? "bg-primary text-primary-foreground"
                          : "bg-emerald-500 text-white"
                      }`}>
                        {msg.role === "student" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>
                      <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-[15px] leading-relaxed ${
                        msg.role === "student"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border prose prose-sm dark:prose-invert break-words"
                      }`}>
                        {msg.role === "student" && visibleContent.startsWith("[EXERCISE_SUBMISSION]") ? (
                          /* ── Exercise submission card ── */
                          (() => {
                            const raw = visibleContent.replace("[EXERCISE_SUBMISSION]", "").trim();
                            const titleMatch = raw.match(/题目：《(.+?)》/);
                            const ansMatch = raw.match(/【我的答案】\n([\s\S]*?)(?=\n\n【|$)/);
                            const procMatch = raw.match(/【解题过程\/思路】\n([\s\S]*?)(?=\n\n请批改|$)/);
                            const title = titleMatch?.[1] ?? "练习题";
                            const ans = ansMatch?.[1]?.trim() ?? "";
                            const proc = procMatch?.[1]?.trim() ?? "";
                            return (
                              <div className="space-y-2 not-prose">
                                <div className="flex items-center gap-1.5 text-primary-foreground/80 text-xs font-medium">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  提交答题
                                </div>
                                <div className="bg-primary-foreground/10 rounded-xl px-3 py-2 space-y-1.5">
                                  <p className="text-xs font-semibold text-primary-foreground/90 truncate">《{title}》</p>
                                  {ans && (
                                    <div className="flex items-start gap-1.5">
                                      <span className="text-xs text-primary-foreground/60 shrink-0 mt-0.5">答案</span>
                                      <span className="text-sm font-medium text-primary-foreground">{ans}</span>
                                    </div>
                                  )}
                                  {proc && (
                                    <div className="flex items-start gap-1.5">
                                      <span className="text-xs text-primary-foreground/60 shrink-0 mt-0.5">思路</span>
                                      <span className="text-xs text-primary-foreground/85 line-clamp-3">{proc}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        ) : visibleContent ? (
                          msg.role === "student" ? (
                            visibleContent
                          ) : (
                            <div className="w-full space-y-4">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {visibleContent}
                              </ReactMarkdown>
                              {msg.liveComponent && (
                                <Badge variant="secondary" className="mt-2 text-[10px]">
                                  <Sparkles className="h-3 w-3 mr-1" /> 已更新黑板演示
                                </Badge>
                              )}
                              <ToolCallTimeline calls={msg.toolCalls} />
                            </div>
                          )
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            {isPendingAgentMessage && <Loader2 className="h-3 w-3 animate-spin" />}
                            {isPendingAgentMessage ? "正在生成完整回答..." : "本轮没有可见文本，已保留黑板/记忆结果。"}
                          </span>
                        )}
                        {!visibleContent && msg.role === "agent" && (
                          <ToolCallTimeline calls={msg.toolCalls} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div ref={scrollRef} className="h-4 shrink-0" />
          </div>
          
          <div className="p-3 bg-background border-t">
            <div className="flex gap-2">
              <Input
                placeholder="输入你的问题..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                disabled={isStreaming}
                className="flex-1"
              />
              <Button onClick={() => void handleSend()} disabled={isStreaming || !inputValue.trim()}>
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
