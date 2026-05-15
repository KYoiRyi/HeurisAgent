import { useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  X,
  Layers,
  MessageCircle,
  Bot,
  User,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Wrench,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";
import type { RuntimeMessage, ToolCallView } from "./types";
import { sanitizeVisibleContent } from "./utils";

export function ChatPanel({
  messages,
  running,
  inputValue,
  onInputChange,
  onSubmit,
  onClose,
  isLoading,
  onShowStage,
}: {
  messages: RuntimeMessage[];
  running: boolean;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  isLoading: boolean;
  onShowStage: (msg: RuntimeMessage) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, running]);

  return (
    <>
      <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-3 dark:border-[rgba(250,249,245,0.08)]">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-3.5 w-3.5 text-[var(--color-coral)]" strokeWidth={2} />
          <span className="text-[13px] font-medium">课堂对话</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {isLoading && messages.length === 0 ? (
          <div className="text-center text-[12.5px] text-[var(--color-muted)]">加载历史…</div>
        ) : messages.length === 0 ? (
          <EmptyChat onPrefill={(q) => onInputChange(q)} />
        ) : (
          messages.map((m) => (
            <ChatBubble
              key={m.id}
              message={m}
              onShowStage={() => onShowStage(m)}
            />
          ))
        )}
        {running && <ThinkingIndicator />}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        className="border-t border-[var(--color-hairline)] p-3 dark:border-[rgba(250,249,245,0.08)]"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); }
            }}
            placeholder="问点什么吧… (Enter 发送, Shift+Enter 换行)"
            rows={2}
            disabled={running}
            className="settings-input flex-1 resize-none py-2.5 leading-relaxed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || running}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-coral)] px-4 text-[12.5px] font-medium text-white transition hover:bg-[var(--color-coral-active)] disabled:opacity-60"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </div>
      </form>
    </>
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
            isStudent ? visible : <Markdown>{visible}</Markdown>
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
