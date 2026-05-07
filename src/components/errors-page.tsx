"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  BookX, AlertTriangle, CheckCircle2, Loader2,
  Plus, Brain, Target, Lightbulb, Filter, RefreshCw
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Markdown } from "@/components/ui/markdown";

interface ErrorQuestion {
  id: string;
  student_name: string;
  subject: string;
  question_text: string;
  student_answer: string | null;
  correct_answer: string | null;
  error_type: string | null;
  error_analysis: string | null;
  knowledge_points: string[];
  difficulty: string;
  reinforcement_suggestions: string | null;
  status: string;
  review_count: number;
  mastered: boolean;
  created_at: string;
}

const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理"];
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "待分析", color: "bg-yellow-500/10 text-yellow-600" },
  analyzed: { label: "已分析", color: "bg-blue-500/10 text-blue-600" },
  reviewing: { label: "复习中", color: "bg-purple-500/10 text-purple-600" },
  mastered: { label: "已掌握", color: "bg-green-500/10 text-green-600" },
};

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // 新增错题表单
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newStudentAnswer, setNewStudentAnswer] = useState("");
  const [newCorrectAnswer, setNewCorrectAnswer] = useState("");
  const [newSubject, setNewSubject] = useState("数学");

  const fetchErrors = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterSubject !== "all") params.set("subject", filterSubject);
      if (filterStatus !== "all") params.set("status", filterStatus);

      const res = await fetch(`/api/errors?${params}`);
      const json = await res.json();
      if (json.success) setErrors(json.data);
    } catch (err) {
      console.error("Fetch errors error:", err);
    } finally {
      setLoading(false);
    }
  }, [filterSubject, filterStatus]);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  const handleAddError = async () => {
    if (!newQuestion.trim()) return;
    setAnalyzing("new");
    try {
      const res = await fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionText: newQuestion,
          studentAnswer: newStudentAnswer,
          correctAnswer: newCorrectAnswer,
          subject: newSubject,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setDialogOpen(false);
        setNewQuestion("");
        setNewStudentAnswer("");
        setNewCorrectAnswer("");
        fetchErrors();
      }
    } catch (err) {
      console.error("Add error error:", err);
    } finally {
      setAnalyzing(null);
    }
  };

  const handleAnalyze = async (errorId: string) => {
    const errorItem = errors.find((e) => e.id === errorId);
    if (!errorItem) return;
    setAnalyzing(errorId);
    try {
      const res = await fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: errorId,
          questionText: errorItem.question_text,
          studentAnswer: errorItem.student_answer,
          correctAnswer: errorItem.correct_answer,
          subject: errorItem.subject,
        }),
      });
      const json = await res.json();
      if (json.success) {
        fetchErrors();
      }
    } catch (err) {
      console.error("Analyze error:", err);
    } finally {
      setAnalyzing(null);
    }
  };

  const errorStats = {
    total: errors.length,
    pending: errors.filter((e) => e.status === "pending").length,
    analyzed: errors.filter((e) => e.status === "analyzed").length,
    mastered: errors.filter((e) => e.mastered).length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-4 py-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center justify-center gap-3">
            <BookX className="h-8 w-8 text-orange-500" />
            错题管理智能体
          </h1>
          <p className="text-muted-foreground mt-2 text-base">错题收集 · 分类分析 · 针对性强化建议</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchErrors}>
            <RefreshCw className="h-4 w-4 mr-1" />刷新
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" />添加错题
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>添加错题</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Select value={newSubject} onValueChange={setNewSubject}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="题目内容"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  rows={3}
                />
                <Textarea
                  placeholder="你的答案（可选）"
                  value={newStudentAnswer}
                  onChange={(e) => setNewStudentAnswer(e.target.value)}
                  rows={2}
                />
                <Textarea
                  placeholder="正确答案（可选）"
                  value={newCorrectAnswer}
                  onChange={(e) => setNewCorrectAnswer(e.target.value)}
                  rows={2}
                />
                <Button onClick={handleAddError} disabled={analyzing === "new" || !newQuestion.trim()} className="w-full">
                  {analyzing === "new" ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" />AI 分析中...</>
                  ) : (
                    <><Brain className="h-4 w-4 mr-1" />提交并分析</>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { title: "总错题数", value: errorStats.total, icon: BookX, color: "text-orange-500", bg: "bg-orange-500/10" },
          { title: "待分析", value: errorStats.pending, icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10" },
          { title: "已分析", value: errorStats.analyzed, icon: Target, color: "text-blue-500", bg: "bg-blue-500/10" },
          { title: "已掌握", value: errorStats.mastered, icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
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
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">筛选：</span>
        </div>
        <Select value={filterSubject} onValueChange={setFilterSubject}>
          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue placeholder="学科" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部学科</SelectItem>
            {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {Object.entries(STATUS_MAP).map(([key, val]) => (
              <SelectItem key={key} value={key}>{val.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error List */}
      <div className="space-y-3">
        {loading ? (
          <Card><CardContent className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>
        ) : errors.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <BookX className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">暂无错题记录，点击上方按钮添加</p>
            </CardContent>
          </Card>
        ) : (
          errors.map((error) => (
            <Card key={error.id} className="overflow-hidden shadow-none border-border">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex-1 space-y-3">
                    {/* Header */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">{error.subject}</Badge>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_MAP[error.status]?.color || "bg-gray-100 text-gray-600"}`}>
                        {STATUS_MAP[error.status]?.label || error.status}
                      </span>
                      {error.error_type && (
                        <Badge variant="outline" className="text-[10px]">{error.error_type}</Badge>
                      )}
                      {error.mastered && (
                        <Badge className="text-[10px] bg-green-500"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />已掌握</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">复习 {error.review_count} 次</Badge>
                    </div>

                    {/* Question */}
                    <div className="text-sm font-medium prose prose-sm dark:prose-invert max-w-none">
                      <Markdown>{error.question_text}</Markdown>
                    </div>

                    {/* Answers */}
                    {(error.student_answer || error.correct_answer) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {error.student_answer && (
                          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-2">
                            <p className="text-[10px] text-red-600 font-medium mb-0.5">学生答案</p>
                            <div className="text-xs prose prose-sm dark:prose-invert max-w-none">
                              <Markdown>{error.student_answer}</Markdown>
                            </div>
                          </div>
                        )}
                        {error.correct_answer && (
                          <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-2">
                            <p className="text-[10px] text-green-600 font-medium mb-0.5">正确答案</p>
                            <div className="text-xs prose prose-sm dark:prose-invert max-w-none">
                              <Markdown>{error.correct_answer}</Markdown>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* AI Analysis */}
                    {error.error_analysis && (
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Brain className="h-3.5 w-3.5 text-blue-500" />
                          <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">AI 错因分析</span>
                        </div>
                        <div className="text-xs text-blue-800 dark:text-blue-300 prose prose-sm dark:prose-invert max-w-none">
                          <Markdown>{error.error_analysis}</Markdown>
                        </div>
                      </div>
                    )}

                    {/* Knowledge Points */}
                    {error.knowledge_points && error.knowledge_points.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Lightbulb className="h-3 w-3 text-amber-500" />
                        {error.knowledge_points.map((point, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{point}</Badge>
                        ))}
                      </div>
                    )}

                    {/* Suggestions */}
                    {error.reinforcement_suggestions && (
                      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3">
                        <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 mb-1">
                          <Target className="h-3 w-3 inline mr-1" />强化建议
                        </p>
                        <div className="text-xs text-amber-800 dark:text-amber-300 prose prose-sm dark:prose-invert max-w-none">
                          <Markdown>{error.reinforcement_suggestions}</Markdown>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex sm:flex-col gap-2">
                    {!error.error_analysis && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAnalyze(error.id)}
                        disabled={analyzing === error.id}
                      >
                        {analyzing === error.id ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Brain className="h-3.5 w-3.5 mr-1" />
                        )}
                        分析
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
