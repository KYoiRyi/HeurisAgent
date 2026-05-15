import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderOpen, Plus, BookOpen, FileText, Sparkles, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { ResourceItem, ResourceListResponse } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";

const CATEGORIES: Array<{ id: string; label: string; icon: typeof BookOpen }> = [
  { id: "all", label: "全部", icon: FolderOpen },
  { id: "knowledge-point", label: "知识卡片", icon: BookOpen },
  { id: "exercise", label: "练习题", icon: Sparkles },
  { id: "document", label: "文档", icon: FileText },
  { id: "note", label: "笔记", icon: FileText },
];

export default function ResourcesRoute() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("all");
  const [subject, setSubject] = useState("");
  const [composing, setComposing] = useState(false);
  const [viewingResource, setViewingResource] = useState<ResourceItem | null>(null);

  const listQ = useQuery({
    queryKey: ["resources", { category, subject }],
    queryFn: () => {
      const p = new URLSearchParams({ limit: "60" });
      if (category !== "all") p.set("category", category);
      if (subject.trim()) p.set("subject", subject.trim());
      return api.get<ResourceListResponse>(`/resources?${p.toString()}`);
    },
  });

  const deleteR = useMutation({
    mutationFn: (id: string) => api.delete(`/resources/${id}`),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["resources"] });
    },
  });

  const items = listQ.data?.items ?? [];
  const subjects = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => s.add(i.subject));
    return Array.from(s).sort();
  }, [items]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="caption-uppercase">Shared knowledge base</div>
          <h1 className="font-display-tight text-[44px] leading-[1.05] tracking-tight text-ink dark:text-on-dark md:text-[52px]">
            教学资源
          </h1>
          <p className="max-w-2xl text-[15.5px] leading-[1.65] text-[var(--color-body)] dark:text-[var(--color-on-dark-soft)]">
            知识卡片、练习题、文档与笔记。课堂智能体即写即用，错题智能体自动引用。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="inline-flex items-center gap-2 self-start rounded-md bg-[var(--color-coral)] px-4 py-2.5 text-[13.5px] font-medium text-white transition hover:bg-[var(--color-coral-active)] md:self-auto"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          新增资源
        </button>
      </header>

      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition",
                  category === c.id
                    ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white dark:border-[var(--color-on-dark)] dark:bg-[var(--color-on-dark)] dark:text-[var(--color-ink)]"
                    : "border-[var(--color-hairline)] text-[var(--color-body)] hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]",
                )}
              >
                <Icon className="h-3 w-3" strokeWidth={2} />
                {c.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="按学科筛选"
              list="resource-subjects"
              className="settings-input h-9 max-w-[180px]"
            />
            <datalist id="resource-subjects">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="caption-uppercase">
          {listQ.isLoading ? "加载中…" : `${items.length} 条资源`}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.length === 0 && !listQ.isLoading && (
            <div className="col-span-full rounded-lg border border-dashed border-[var(--color-hairline)] p-12 text-center text-[13.5px] text-[var(--color-muted)] dark:border-[rgba(250,249,245,0.08)]">
              暂无资源。点击「新增资源」或让课堂智能体生成。
            </div>
          )}
          {items.map((r) => (
            <ResourceCard key={r.id} item={r} onDelete={() => deleteR.mutate(r.id)} onClick={() => setViewingResource(r)} />
          ))}
        </div>
      </section>

      {viewingResource && (
        <ResourceDetailModal item={viewingResource} onClose={() => setViewingResource(null)} />
      )}

      {composing && (
        <ComposeModal
          onClose={() => setComposing(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["resources"] });
            setComposing(false);
          }}
        />
      )}
    </div>
  );
}

function ResourceCard({ item, onDelete, onClick }: { item: ResourceItem; onDelete: () => void; onClick: () => void }) {
  return (
    <div
      role="button"
      onClick={onClick}
      className="group relative flex h-full cursor-pointer flex-col rounded-lg border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(20,20,19,0.06)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]"
    >      <div className="flex items-start justify-between gap-2">
        <span className="caption-uppercase text-[10px]">
          {item.category} · {item.subject}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 transition group-hover:opacity-100 grid h-6 w-6 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-coral-active)]"
        >
          <Trash2 className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>
      <h3 className="mt-2 font-display text-[18px] leading-tight tracking-tight text-ink dark:text-on-dark">
        {item.title}
      </h3>
      {item.content && (
        <p className="mt-2 line-clamp-4 flex-1 text-[13px] leading-[1.6] text-[var(--color-body)] dark:text-[var(--color-on-dark-soft)] whitespace-pre-wrap">
          {item.content}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
        {item.tags.slice(0, 4).map((t) => (
          <span
            key={t}
            className="rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-body)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function ComposeModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    subject: "",
    category: "knowledge-point",
    content: "",
    tags: "",
    difficulty: "medium",
  });

  const save = useMutation({
    mutationFn: () =>
      api.post<ResourceItem>("/resources", {
        title: form.title.trim(),
        subject: form.subject.trim() || "通用",
        category: form.category,
        content: form.content.trim(),
        tags: form.tags
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean),
        difficulty: form.difficulty,
        created_by: "user",
      }),
    onSuccess: () => {
      toast.success("已保存");
      onSaved();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "保存失败"),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl space-y-4 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-6 shadow-2xl dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[22px] tracking-tight text-ink dark:text-on-dark">新建资源</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--color-surface-soft)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="标题"
            className="settings-input col-span-2"
          />
          <input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="学科 (例如：数学)"
            className="settings-input"
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="settings-input"
          >
            <option value="knowledge-point">知识卡片</option>
            <option value="exercise">练习题</option>
            <option value="document">文档</option>
            <option value="note">笔记</option>
          </select>
        </div>
        <textarea
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder="内容（支持 Markdown）"
          className="settings-input min-h-[160px] resize-y py-2.5 leading-relaxed"
        />
        <input
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          placeholder="标签 (逗号分隔)"
          className="settings-input"
        />
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-hairline)] px-4 py-2 text-[13px] font-medium text-[var(--color-body)] transition hover:bg-[var(--color-surface-soft)] dark:border-[rgba(250,249,245,0.08)]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!form.title.trim() || save.isPending}
            onClick={() => save.mutate()}
            className="rounded-md bg-[var(--color-coral)] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[var(--color-coral-active)] disabled:opacity-60"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function ResourceDetailModal({ item, onClose }: { item: ResourceItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] shadow-2xl dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-elev)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-6 py-4 dark:border-[rgba(250,249,245,0.08)]">
          <div>
            <div className="caption-uppercase text-[10px]">{item.category} · {item.subject}</div>
            <h2 className="mt-1 font-display text-[22px] tracking-tight text-ink dark:text-on-dark">{item.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--color-surface-soft)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {item.content ? (
            <div className="prose prose-sm dark:prose-invert max-w-none [&_pre]:bg-[var(--color-surface-soft)] dark:[&_pre]:bg-[var(--color-surface-dark-soft)]">
              <Markdown>{item.content}</Markdown>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--color-muted)]">该资料暂无正文内容。</p>
          )}
        </div>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-hairline)] px-6 py-3 dark:border-[rgba(250,249,245,0.08)]">
            {item.tags.map((t) => (
              <span key={t} className="rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface-soft)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-body)] dark:border-[rgba(250,249,245,0.08)] dark:bg-[var(--color-surface-dark-soft)]">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
