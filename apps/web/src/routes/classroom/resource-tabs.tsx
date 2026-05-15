import { ChevronLeft, ChevronRight, FileText, RefreshCw, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";
import type { ResourceItem } from "@/lib/api-types";
import { INTERACTIVE_TAB } from "./types";

export function ResourceTabs({
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
          onClick={() => { if (tabsScrollRef.current) tabsScrollRef.current.scrollLeft -= 160; }}
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
          onClick={() => { if (tabsScrollRef.current) tabsScrollRef.current.scrollLeft += 160; }}
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

export function ResourceView({ resource }: { resource: ResourceItem }) {
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
