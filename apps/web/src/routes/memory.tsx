import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Plus, Pin, Trash2, Tag, X } from "lucide-react";
import { api } from "@/lib/api";
import type { MemoryItem, MemoryListResponse } from "@/lib/api-types";
import { cn } from "@/lib/utils";

export default function MemoryRoute() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "pinned">("all");

  const listQ = useQuery({
    queryKey: ["memory", { query: activeQuery, filter }],
    queryFn: () => {
      if (activeQuery.trim()) {
        return api.get<{ items: MemoryItem[] }>(
          `/memory/search?q=${encodeURIComponent(activeQuery)}&limit=80`,
        ).then((r) => ({ items: r.items, total: r.items.length }));
      }
      const params = new URLSearchParams({ limit: "80" });
      if (filter === "pinned") params.set("pinned", "true");
      return api.get<MemoryListResponse>(`/memory?${params.toString()}`);
    },
  });

  const addM = useMutation({
    mutationFn: (input: { content: string; tags: string[]; importance: 1 | 2 | 3; pinned: boolean }) =>
      api.post<MemoryItem>("/memory", input),
    onSuccess: () => {
      toast.success("已写入记忆");
      qc.invalidateQueries({ queryKey: ["memory"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "写入失败"),
  });

  const togglePin = useMutation({
    mutationFn: (m: MemoryItem) => api.patch<MemoryItem>(`/memory/${m.id}`, { pinned: !m.pinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memory"] }),
  });

  const deleteM = useMutation({
    mutationFn: (id: number) => api.delete(`/memory/${id}`),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["memory"] });
    },
  });

  const items = listQ.data?.items ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="caption-uppercase">Long-term memory</div>
        <h1 className="font-display-tight text-[44px] leading-[1.05] tracking-tight text-ink dark:text-on-dark md:text-[52px]">
          记忆中心
        </h1>
        <p className="max-w-2xl text-[15.5px] leading-[1.65] text-[var(--color-body)] dark:text-[var(--color-on-dark-soft)]">
          PG tsvector 全文检索 · 三智能体共享 · 记忆按重要度与置顶状态排序。
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <ComposeCard onSubmit={(v) => addM.mutate(v)} pending={addM.isPending} />
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setActiveQuery(query.trim());
              }}
              className="flex flex-1 items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索记忆 (tsvector)…"
                  className="settings-input pl-9"
                />
                {activeQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setActiveQuery("");
                    }}
                    className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </form>
            <div className="flex gap-2">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
                全部
              </FilterChip>
              <FilterChip active={filter === "pinned"} onClick={() => setFilter("pinned")}>
                已置顶
              </FilterChip>
            </div>
          </div>

          <div className="caption-uppercase text-[var(--color-muted)]">
            {listQ.isLoading ? "加载中…" : `${items.length} 条 · ${activeQuery ? `搜索 "${activeQuery}"` : filter === "pinned" ? "已置顶" : "全部记忆"}`}
          </div>

          <div className="space-y-3">
            {items.length === 0 && !listQ.isLoading && (
              <div className="rounded-lg border border-dashed border-[var(--color-hairline)] p-8 text-center text-[13.5px] text-[var(--color-muted)] dark:border-[rgba(250,249,245,0.08)]">
                暂无记忆，写下第一条吧。
              </div>
            )}
            {items.map((m) => (
              <MemoryCard
                key={m.id}
                item={m}
                onTogglePin={() => togglePin.mutate(m)}
                onDelete={() => deleteM.mutate(m.id)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ComposeCard({
  onSubmit,
  pending,
}: {
  onSubmit: (v: { content: string; tags: string[]; importance: 1 | 2 | 3; pinned: boolean }) => void;
  pending: boolean;
}) {
  const [content, setContent] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [importance, setImportance] = useState<1 | 2 | 3>(1);
  const [pinned, setPinned] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!content.trim()) return;
        const tags = tagsRaw
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean);
        onSubmit({ content: content.trim(), tags, importance, pinned });
        setContent("");
        setTagsRaw("");
        setImportance(1);
        setPinned(false);
      }}
      className="space-y-4 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-6 dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]"
    >
      <div>
        <div className="caption-uppercase mb-1.5">写入记忆</div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="例如：学生小明 数学薄弱在分式方程"
          className="settings-input min-h-[120px] resize-y py-2.5 leading-relaxed"
        />
      </div>
      <div>
        <div className="caption-uppercase mb-1.5">Tags</div>
        <input
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          placeholder="profile, subject:数学"
          className="settings-input"
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="text-[var(--color-muted)]">重要度</span>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setImportance(n as 1 | 2 | 3)}
              className={cn(
                "h-7 w-7 rounded-md border text-[12px] font-medium transition",
                importance === n
                  ? "border-[var(--color-coral)] bg-[var(--color-coral)]/10 text-[var(--color-coral-active)]"
                  : "border-[var(--color-hairline)] text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-body-strong)] dark:text-[var(--color-on-dark-soft)]">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-coral)]"
          />
          置顶
        </label>
      </div>
      <button
        type="submit"
        disabled={pending || !content.trim()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-coral)] py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[var(--color-coral-active)] disabled:opacity-60"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        添加记忆
      </button>
    </form>
  );
}

function MemoryCard({
  item,
  onTogglePin,
  onDelete,
}: {
  item: MemoryItem;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-[var(--color-canvas)] p-5 transition dark:bg-[var(--color-surface-dark-elev)]",
        item.pinned
          ? "border-[var(--color-coral)]/40 shadow-[0_0_0_1px_rgba(204,120,92,0.08)]"
          : "border-[var(--color-hairline)] dark:border-[rgba(250,249,245,0.08)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] leading-[1.65] text-[var(--color-body-strong)] dark:text-on-dark whitespace-pre-wrap">
            {item.content}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {item.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--color-body)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]"
              >
                <Tag className="h-2.5 w-2.5" strokeWidth={2} />
                {t}
              </span>
            ))}
            <span className="ml-auto text-[10.5px] text-[var(--color-muted)]">
              {new Date(item.created_at).toLocaleString("zh-CN", { hour12: false })} · {item.source} · L{item.importance}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={onTogglePin}
            title={item.pinned ? "取消置顶" : "置顶"}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-md border transition",
              item.pinned
                ? "border-[var(--color-coral)] bg-[var(--color-coral)]/10 text-[var(--color-coral-active)]"
                : "border-[var(--color-hairline)] text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]",
            )}
          >
            <Pin className="h-3 w-3" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="删除"
            className="grid h-7 w-7 place-items-center rounded-md border border-[var(--color-hairline)] text-[var(--color-muted)] transition hover:bg-[#fef0eb] hover:text-[var(--color-coral-active)] dark:border-[rgba(250,249,245,0.08)]"
          >
            <Trash2 className="h-3 w-3" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition",
        active
          ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white dark:border-[var(--color-on-dark)] dark:bg-[var(--color-on-dark)] dark:text-[var(--color-ink)]"
          : "border-[var(--color-hairline)] text-[var(--color-body)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]",
      )}
    >
      {children}
    </button>
  );
}
