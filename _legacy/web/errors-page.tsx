"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  BookX, AlertTriangle, CheckCircle2, Loader2, Send,
  Plus, Brain, Target, Lightbulb, Filter, RefreshCw, MessageCircleQuestion, HelpCircle, ArrowRight
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
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
  pending: { label: "待问诊", color: "bg-yellow-500/10 text-yellow-600" },
  analyzed: { label: "已分析", color: "bg-blue-500/10 text-blue-600" },
  reviewing: { label: "复习中", color: "bg-purple-500/10 text-purple-600" },
  mastered: { label: "已掌握", color: "bg-green-500/10 text-green-600" },
};

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newStudentAnswer, setNewStudentAnswer] = useState("");
  const [newCorrectAnswer, setNewCorrectAnswer] = useState("");
  const [newSubject, setNewSubject] = useState("数学");
  const [adding, setAdding] = useState(false);

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
    setAdding(true);
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
      setAdding(false);
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
      <div className="flex flex-col items-center text-center gap-4 py-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center justify-center gap-3">
            <BookX className="h-8 w-8 text-orange-500" />
            错题智能体诊断室
          </h1>
          <p className="text-muted-foreground mt-2 text-base">苏格拉底错题问诊 · 变式选择题检验</p>
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
                <Textarea placeholder="题目内容" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} rows={3} />
                <Textarea placeholder="你的答案（可选）" value={newStudentAnswer} onChange={(e) => setNewStudentAnswer(e.target.value)} rows={2} />
                <Textarea placeholder="正确答案（可选）" value={newCorrectAnswer} onChange={(e) => setNewCorrectAnswer(e.target.value)} rows={2} />
                <Button onClick={handleAddError} disabled={adding || !newQuestion.trim()} className="w-full">
                  {adding ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />添加中...</> : <><Plus className="h-4 w-4 mr-1" />录入错题</>}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { title: "总错题数", value: errorStats.total, icon: BookX, color: "text-orange-500", bg: "bg-orange-500/10" },
          { title: "待问诊", value: errorStats.pending, icon: MessageCircleQuestion, color: "text-yellow-500", bg: "bg-yellow-500/10" },
          { title: "已分析", value: errorStats.analyzed, icon: Brain, color: "text-blue-500", bg: "bg-blue-500/10" },
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">{error.subject}</Badge>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_MAP[error.mastered ? 'mastered' : error.status]?.color || "bg-gray-100 text-gray-600"}`}>
                        {STATUS_MAP[error.mastered ? 'mastered' : error.status]?.label || error.status}
                      </span>
                      {error.error_type && <Badge variant="outline" className="text-[10px]">{error.error_type}</Badge>}
                      {error.review_count > 0 && (
                        <Badge variant="outline" className="text-[10px]">复习 {error.review_count} 次</Badge>
                      )}
                    </div>

                    <div className="text-sm font-medium prose prose-sm dark:prose-invert max-w-none">
                      <Markdown>{error.question_text}</Markdown>
                    </div>

                    {(error.student_answer || error.correct_answer) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {error.student_answer && (
                          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-2">
                            <p className="text-[10px] text-red-600 font-medium mb-0.5">你的答案</p>
                            <div className="text-xs prose prose-sm dark:prose-invert max-w-none"><Markdown>{error.student_answer}</Markdown></div>
                          </div>
                        )}
                        {error.correct_answer && (
                          <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-2">
                            <p className="text-[10px] text-green-600 font-medium mb-0.5">正确答案</p>
                            <div className="text-xs prose prose-sm dark:prose-invert max-w-none"><Markdown>{error.correct_answer}</Markdown></div>
                          </div>
                        )}
                      </div>
                    )}

                    {error.error_analysis && (
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Brain className="h-3.5 w-3.5 text-blue-500" />
                          <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">诊断报告</span>
                        </div>
                        <div className="text-xs text-blue-800 dark:text-blue-300 prose prose-sm dark:prose-invert max-w-none">
                          <Markdown>{error.error_analysis}</Markdown>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex sm:flex-col gap-2 shrink-0">
                    {(!error.error_analysis || error.status === "pending") ? (
                      <DiagnosisDialog error={error} onComplete={fetchErrors} />
                    ) : !error.mastered ? (
                      <MutationDialog error={error} onComplete={fetchErrors} />
                    ) : null}
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

// -------------------------------
// 苏格拉底错题问诊 Dialog
// -------------------------------
function DiagnosisDialog({ error, onComplete }: { error: ErrorQuestion; onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize first greeting
  useEffect(() => {
    if (open && messages.length === 0) {
      handleChat([{ role: "assistant", content: `你好！我看了一下这道${error.subject}题。你先告诉我，你当时做这道题的想法是什么？或者你觉得哪里最卡壳？` }]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleChat = async (history: {role: string, content: string}[]) => {
    setMessages(history);
    setStreaming(true);

    try {
      const res = await fetch("/api/errors/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.filter(m => m.role !== 'assistant' || history.indexOf(m) !== 0), errorQuestion: error }) // skip the manual first greeting in API context to avoid duplication
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = "";

      setMessages([...history, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              assistantMsg += data.content;
              setMessages([...history, { role: "assistant", content: assistantMsg }]);
            }
          } catch { /* ignore */ }
        }
      }

      // Check if AI completed the diagnosis
      if (assistantMsg.includes("[DIAGNOSIS_COMPLETE]")) {
        const analysis = assistantMsg.replace("[DIAGNOSIS_COMPLETE]", "").trim();
        // Update DB
        await fetch("/api/errors", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: error.id, status: "analyzed", error_analysis: analysis })
        });
        setTimeout(() => {
          setOpen(false);
          onComplete();
        }, 3000); // give user time to read the final message
      }

    } catch (err) {
      console.error(err);
    } finally {
      setStreaming(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || streaming) return;
    const newMessages = [...messages, { role: "user", content: input }];
    setInput("");
    handleChat(newMessages);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-white w-full">
          <MessageCircleQuestion className="h-3.5 w-3.5 mr-1" />
          智能问诊
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircleQuestion className="h-5 w-5 text-yellow-500" />
            苏格拉底诊断室
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30 rounded-md border">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm prose prose-sm dark:prose-invert ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-background border shadow-sm'
              }`}>
                <Markdown>{msg.content.replace("[DIAGNOSIS_COMPLETE]", "\n\n*(✅ 诊断完成，报告已生成！)*")}</Markdown>
              </div>
            </div>
          ))}
          {streaming && <div className="text-muted-foreground text-xs animate-pulse">智能体正在思考...</div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex gap-2 mt-2">
          <Input 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            placeholder="回复智能体..." 
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={streaming}
          />
          <Button onClick={handleSend} disabled={!input.trim() || streaming} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------
// 变式选择题弹窗 Dialog
// -------------------------------
function MutationDialog({ error, onComplete }: { error: ErrorQuestion; onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mutation, setMutation] = useState<any>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<'success'|'fail'|null>(null);

  useEffect(() => {
    if (open && !mutation) {
      setLoading(true);
      fetch("/api/errors/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ errorQuestion: error })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) setMutation(data.data);
      })
      .finally(() => setLoading(false));
    }
  }, [open, mutation, error]);

  const handleSubmit = async () => {
    if (!selected) return;
    const isCorrect = selected === mutation.correctAnswer;
    setResult(isCorrect ? 'success' : 'fail');

    if (isCorrect) {
      await fetch("/api/errors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: error.id, mastered: true })
      });
      setTimeout(() => {
        setOpen(false);
        onComplete();
      }, 3000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if(!v){ setMutation(null); setResult(null); setSelected(null); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-green-500 text-green-600 hover:bg-green-50 w-full dark:hover:bg-green-950/30">
          <Target className="h-3.5 w-3.5 mr-1" />
          检验掌握
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-green-500" />
            变式题检验
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /><p className="text-sm mt-2 text-muted-foreground">正在为您生成同知识点变式题...</p></div>
        ) : mutation ? (
          <div className="space-y-4 py-2">
            <div className="text-sm font-medium prose prose-sm dark:prose-invert">
              <Markdown>{mutation.question}</Markdown>
            </div>
            <div className="space-y-2">
              {['A', 'B', 'C', 'D'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => !result && setSelected(opt)}
                  disabled={!!result}
                  className={`w-full text-left p-3 rounded-lg border text-sm transition-colors flex gap-3 ${
                    selected === opt && !result ? 'border-primary bg-primary/5' : 
                    result && opt === mutation.correctAnswer ? 'border-green-500 bg-green-50 text-green-700' :
                    result && selected === opt && selected !== mutation.correctAnswer ? 'border-red-500 bg-red-50 text-red-700' :
                    'hover:bg-muted'
                  }`}
                >
                  <span className="font-bold">{opt}.</span> 
                  <span className="flex-1"><Markdown>{mutation.options[opt]}</Markdown></span>
                </button>
              ))}
            </div>

            {result && (
              <div className={`p-3 rounded-lg text-sm ${result === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                <p className="font-bold flex items-center gap-1">
                  {result === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {result === 'success' ? '回答正确！' : '回答错误！'}
                </p>
                <p className="mt-1 opacity-90">{mutation.explanation}</p>
                {result === 'success' && <p className="mt-2 text-xs opacity-75">太棒了，这道错题将被标记为“已掌握”！</p>}
              </div>
            )}

            {!result && (
              <Button onClick={handleSubmit} disabled={!selected} className="w-full">提交答案</Button>
            )}
          </div>
        ) : (
           <div className="p-8 text-center text-red-500">生成失败，请重试</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
