"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FolderOpen, Plus, Search, FileText, Video, BookOpen, PenTool,
  Loader2, RefreshCw, Tag, Upload
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";

interface Resource {
  id: string;
  title: string;
  subject: string;
  category: string;
  content: string | null;
  tags: string[];
  difficulty: string;
  created_by: string;
  is_shared: boolean;
  created_at: string;
}

const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理"];
const CATEGORIES = [
  { value: "document", label: "文档资料", icon: FileText, color: "text-blue-500" },
  { value: "video", label: "视频教程", icon: Video, color: "text-red-500" },
  { value: "exercise", label: "练习题库", icon: PenTool, color: "text-green-500" },
  { value: "note", label: "学习笔记", icon: BookOpen, color: "text-amber-500" },
];

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Add resource form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSubject, setNewSubject] = useState("数学");
  const [newCategory, setNewCategory] = useState("document");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newDifficulty, setNewDifficulty] = useState("medium");
  const [submitting, setSubmitting] = useState(false);

  const fetchResources = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterSubject !== "all") params.set("subject", filterSubject);
      if (filterCategory !== "all") params.set("category", filterCategory);

      const res = await fetch(`/api/resources?${params}`);
      const json = await res.json();
      if (json.success) setResources(json.data);
    } catch (err) {
      console.error("Fetch resources error:", err);
    } finally {
      setLoading(false);
    }
  }, [filterSubject, filterCategory]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const handleAddResource = async () => {
    if (!newTitle.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          subject: newSubject,
          category: newCategory,
          content: newContent,
          tags: newTags ? newTags.split(",").map((t) => t.trim()) : [],
          difficulty: newDifficulty,
          createdBy: "教师",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setDialogOpen(false);
        setNewTitle("");
        setNewContent("");
        setNewTags("");
        fetchResources();
      }
    } catch (err) {
      console.error("Add resource error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const getCategoryInfo = (cat: string) => CATEGORIES.find((c) => c.value === cat) || CATEGORIES[0];

  const filteredResources = resources.filter((r) => {
    if (searchQuery && !r.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const resourceStats = {
    total: resources.length,
    documents: resources.filter((r) => r.category === "document").length,
    videos: resources.filter((r) => r.category === "video").length,
    exercises: resources.filter((r) => r.category === "exercise").length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-4 py-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center justify-center gap-3">
            <FolderOpen className="h-8 w-8 text-cyan-500" />
            教学资源库
          </h1>
          <p className="text-muted-foreground mt-2 text-base">多智能体共享知识基础 · 资源导入与共享</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchResources}>
            <RefreshCw className="h-4 w-4 mr-1" />刷新
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" />导入资源</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>导入教学资源</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="资源标题"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={newSubject} onValueChange={setNewSubject}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Select value={newDifficulty} onValueChange={setNewDifficulty}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">初级</SelectItem>
                    <SelectItem value="medium">中级</SelectItem>
                    <SelectItem value="hard">高级</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="资源内容"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={4}
                />
                <Input
                  placeholder="标签（逗号分隔）"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                />
                <Button onClick={handleAddResource} disabled={submitting || !newTitle.trim()} className="w-full">
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" />导入中...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-1" />导入资源</>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { title: "全部资源", value: resourceStats.total, icon: FolderOpen, color: "text-cyan-500", bg: "bg-cyan-500/10" },
          { title: "文档资料", value: resourceStats.documents, icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10" },
          { title: "视频教程", value: resourceStats.videos, icon: Video, color: "text-red-500", bg: "bg-red-500/10" },
          { title: "练习题库", value: resourceStats.exercises, icon: PenTool, color: "text-green-500", bg: "bg-green-500/10" },
        ].map((card) => (
          <Card key={card.title}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.bg}`}>
                <card.icon className={`h-4.5 w-4.5 ${card.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{card.title}</p>
                <p className="text-xl font-bold">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索资源..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={filterSubject} onValueChange={setFilterSubject}>
          <SelectTrigger className="w-24 h-9 text-xs"><SelectValue placeholder="学科" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部学科</SelectItem>
            {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-24 h-9 text-xs"><SelectValue placeholder="类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Resource Grid */}
      {loading ? (
        <Card><CardContent className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>
      ) : filteredResources.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">暂无教学资源，点击上方按钮导入</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredResources.map((resource) => {
            const catInfo = getCategoryInfo(resource.category);
            return (
              <Card key={resource.id} className="hover:bg-muted/10 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      resource.category === "document" ? "bg-blue-500/10" :
                      resource.category === "video" ? "bg-red-500/10" :
                      resource.category === "exercise" ? "bg-green-500/10" : "bg-amber-500/10"
                    }`}>
                      <catInfo.icon className={`h-5 w-5 ${catInfo.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold truncate">{resource.title}</h3>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">{resource.subject}</Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {resource.difficulty === "easy" ? "初级" : resource.difficulty === "medium" ? "中级" : "高级"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{catInfo.label}</Badge>
                      </div>
                      {resource.content && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{resource.content.substring(0, 100)}</p>
                      )}
                      {resource.tags && resource.tags.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          <Tag className="h-2.5 w-2.5 text-muted-foreground" />
                          {resource.tags.slice(0, 3).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-[9px] h-4">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
