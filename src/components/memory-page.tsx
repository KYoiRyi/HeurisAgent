"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Brain, Search, Plus, Trash2, Pin, Star, Tag,
  Clock, BookOpen, MessageSquare, RefreshCw, Loader2,
  X, Sparkles, AlertCircle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface Memory {
  id: number;
  content: string;
  source: string;
  tags: string[];
  importance: number;
  pinned: boolean;
  session_id: string | null;
  created_at: string;
}

const SOURCE_META: Record<string, { label: string; color: string; icon: typeof Brain }> = {
  manual:    { label: "手动", color: "bg-slate-500/10 text-slate-600 dark:text-slate-400", icon: Brain },
  classroom: { label: "课堂", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: MessageSquare },
  error:     { label: "错题", color: "bg-orange-500/10 text-orange-600 dark:text-orange-400", icon: BookOpen },
  review:    { label: "复习", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400", icon: Clock },
  cron:      { label: "任务", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400", icon: Sparkles },
  auto:      { label: "自动", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400", icon: Sparkles },
  agent_tool: { label: "智能体", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", icon: Sparkles },
};

const SOURCE_FILTERS = ["", "manual", "classroom", "error", "review", "cron", "auto", "agent_tool"];

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newImportance, setNewImportance] = useState<1 | 2 | 3>(1);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (query) params.set("q", query);
      if (sourceFilter) params.set("source", sourceFilter);
      const res = await fetch(`/api/memory?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setMemories(json.data);
        setTotal(json.total);
      } else {
        setError(json.error || "记忆读取失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "记忆读取失败");
    } finally {
      setLoading(false);
    }
  }, [query, sourceFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    setError(null);
    const res = await fetch("/api/memory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const json = await res.json();
    if (json.success) {
      setMemories((m) => m.filter((x) => x.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } else {
      setError(json.error || "记忆删除失败");
    }
  };

  const handlePin = async (mem: Memory) => {
    setError(null);
    const res = await fetch("/api/memory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: mem.id, pinned: !mem.pinned }),
    });
    const json = await res.json();
    if (json.success) setMemories((m) => m.map((x) => x.id === mem.id ? json.data : x));
    else setError(json.error || "记忆更新失败");
  };

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const tags = newTags.split(/[,，\s]+/).filter(Boolean);
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent, source: "manual", tags, importance: newImportance }),
      });
      const json = await res.json();
      if (json.success) {
        setMemories((m) => [json.data, ...m]);
        setNewContent(""); setNewTags(""); setNewImportance(1); setShowAdd(false);
        setTotal((t) => t + 1);
      } else {
        setError(json.error || "记忆保存失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "记忆保存失败");
    } finally {
      setAdding(false);
    }
  };

  const pinned = memories.filter((m) => m.pinned);
  const unpinned = memories.filter((m) => !m.pinned);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-4 py-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center justify-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            记忆中心
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {total} 条记忆 · 跨会话持久化 · 智能体可调用
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button onClick={() => setShowAdd(!showAdd)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            添加记忆
          </Button>
        </div>
      </div>

      {/* Add Memory Form */}
      {showAdd && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-5 space-y-3">
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="记录任何值得记住的内容…"
              className="min-h-[80px] resize-none"
              autoFocus
            />
            <div className="flex gap-3 flex-wrap">
              <Input
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="标签 (逗号分隔)"
                className="flex-1 min-w-[140px]"
              />
              <div className="flex gap-1">
                {([1, 2, 3] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setNewImportance(lvl)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${newImportance === lvl ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/50"}`}
                  >
                    {lvl === 1 ? "普通" : lvl === 2 ? "重要" : "关键"}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={handleAdd} disabled={adding || !newContent.trim()} className="gap-1">
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                保存
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索记忆内容…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {SOURCE_FILTERS.map((src) => (
            <button
              key={src || "all"}
              onClick={() => setSourceFilter(src)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${sourceFilter === src ? "bg-primary/10 border-primary text-primary" : "border-border hover:border-primary/30 text-muted-foreground"}`}
            >
              {src ? (SOURCE_META[src]?.label ?? src) : "全部"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Pinned section */}
      {pinned.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Pin className="h-3 w-3" /> 已固定
          </div>
          {pinned.map((m) => <MemoryCard key={m.id} memory={m} onDelete={handleDelete} onPin={handlePin} />)}
        </div>
      )}

      {/* All memories */}
      {loading && memories.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : unpinned.length === 0 && pinned.length === 0 ? (
        <Card className="bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
            <Brain className="h-10 w-10 opacity-30" />
            <p className="text-sm">{query ? "没有匹配的记忆" : "还没有记忆 — 开始聊天或手动添加"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {unpinned.map((m) => <MemoryCard key={m.id} memory={m} onDelete={handleDelete} onPin={handlePin} />)}
        </div>
      )}
    </div>
  );
}

// ── Memory Card ───────────────────────────────────────────────────────────────

function MemoryCard({ memory: m, onDelete, onPin }: {
  memory: Memory;
  onDelete: (id: number) => void;
  onPin: (m: Memory) => void;
}) {
  const src = SOURCE_META[m.source] ?? SOURCE_META.manual;

  return (
    <Card className={`group transition-all ${m.pinned ? "border-primary/30 bg-primary/5" : ""}`}>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="secondary" className={`text-[10px] h-4 px-1.5 ${src.color}`}>
                {src.label}
              </Badge>
              {m.importance >= 2 && (
                <Badge variant="secondary" className={`text-[10px] h-4 px-1 ${m.importance === 3 ? "bg-red-500/10 text-red-600" : "bg-yellow-500/10 text-yellow-600"}`}>
                  <Star className="h-2.5 w-2.5 mr-0.5" />
                  {m.importance === 3 ? "关键" : "重要"}
                </Badge>
              )}
              {m.tags.map((t) => (
                <span key={t} className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Tag className="h-2.5 w-2.5" />{t}
                </span>
              ))}
              <span className="text-[10px] text-muted-foreground ml-auto">
                {new Date(m.created_at).toLocaleDateString("zh-CN")}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onPin(m)}
              className={`p-1.5 rounded-md hover:bg-accent transition-colors ${m.pinned ? "text-primary" : "text-muted-foreground"}`}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(m.id)}
              className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
