"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CalendarClock, Brain, Target, Sparkles, Loader2, RefreshCw,
  CheckCircle2, Clock, AlertCircle, Lightbulb, ArrowRight,
  BookOpen
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

interface ReviewPlan {
  id: string;
  student_name: string;
  subject: string;
  plan_title: string;
  plan_content: string;
  blind_spots: string[];
  schedule: Array<{ day: string; tasks: string[]; duration_minutes: number }>;
  priority_topics: Array<{ topic: string; priority: string; reason: string }>;
  review_strategy: string;
  progress: number;
  total_tasks: number;
  completed_tasks: number;
  status: string;
  created_at: string;
}

const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理"];

export default function ReviewPage() {
  const [plans, setPlans] = useState<ReviewPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [studentName, setStudentName] = useState("张三");
  const [selectedSubject, setSelectedSubject] = useState("数学");

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch(`/api/review?student_name=${encodeURIComponent(studentName)}`);
      const json = await res.json();
      if (json.success) setPlans(json.data);
    } catch (err) {
      console.error("Fetch plans error:", err);
    } finally {
      setLoading(false);
    }
  }, [studentName]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName,
          subject: selectedSubject,
          forceRegenerate: true,
        }),
      });
      const json = await res.json();
      if (json.success) {
        fetchPlans();
      }
    } catch (err) {
      console.error("Generate plan error:", err);
    } finally {
      setGenerating(false);
    }
  };

  const activePlan = plans.find((p) => p.status === "active");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-4 py-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center justify-center gap-3">
            <CalendarClock className="h-8 w-8 text-purple-500" />
            复习策略智能体
          </h1>
          <p className="text-muted-foreground mt-2 text-base">个性化复习计划 · 知识盲点提示 · 艾宾浩斯遗忘曲线</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="学生姓名"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className="w-28"
          />
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={fetchPlans}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />刷新
          </Button>
          <Button size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />生成中...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1" />生成计划</>
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>
      ) : !activePlan ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10 mx-auto mb-4">
              <Brain className="h-8 w-8 text-purple-500" />
            </div>
            <h3 className="text-lg font-semibold">尚未生成复习计划</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              复习策略智能体会根据你的错题记录、课堂参与情况和学习数据，自动生成个性化复习计划和知识盲点提示。
            </p>
            <Button className="mt-4" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />AI 分析中...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1.5" />立即生成复习计划</>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Plan */}
          <div className="lg:col-span-2 space-y-4">
            {/* Plan Header */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      {activePlan.plan_title}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {activePlan.subject} · 生成于 {new Date(activePlan.created_at).toLocaleDateString("zh-CN")}
                    </CardDescription>
                  </div>
                  <Badge className="bg-purple-500">活跃</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">完成进度</span>
                      <span className="font-semibold">{activePlan.completed_tasks}/{activePlan.total_tasks} 任务</span>
                    </div>
                    <Progress
                      value={activePlan.total_tasks > 0 ? (activePlan.completed_tasks / activePlan.total_tasks) * 100 : 0}
                      className="h-2"
                    />
                  </div>

                  {activePlan.plan_content && (
                    <div className="rounded-lg bg-purple-50 dark:bg-purple-950/20 p-4">
                      <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-2">复习计划详情</h4>
                      <p className="text-sm text-purple-800 dark:text-purple-300 whitespace-pre-wrap">{activePlan.plan_content}</p>
                    </div>
                  )}

                  {activePlan.review_strategy && (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4">
                      <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                        <Lightbulb className="h-3.5 w-3.5" />复习策略建议
                      </h4>
                      <p className="text-sm text-blue-800 dark:text-blue-300 whitespace-pre-wrap">{activePlan.review_strategy}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Schedule */}
            {activePlan.schedule && activePlan.schedule.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-purple-500" />
                    复习日程安排
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {activePlan.schedule.map((day, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 text-xs font-bold">
                            {i + 1}
                          </div>
                          {i < activePlan.schedule.length - 1 && (
                            <div className="w-px h-full bg-purple-200 dark:bg-purple-800 mt-1" />
                          )}
                        </div>
                        <div className="flex-1 pb-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">{day.day}</span>
                            <Badge variant="outline" className="text-[10px]">{day.duration_minutes} 分钟</Badge>
                          </div>
                          <ul className="space-y-1">
                            {day.tasks.map((task, j) => (
                              <li key={j} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <ArrowRight className="h-2.5 w-2.5 text-purple-400" />
                                {task}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Blind Spots */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  知识盲点提示
                </CardTitle>
                <CardDescription className="text-xs">复习策略智能体识别的薄弱环节</CardDescription>
              </CardHeader>
              <CardContent>
                {activePlan.blind_spots && activePlan.blind_spots.length > 0 ? (
                  <div className="space-y-2">
                    {activePlan.blind_spots.map((spot, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/50 p-2.5">
                        <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                        <span className="text-xs">{spot}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">暂无识别的知识盲点</p>
                )}
              </CardContent>
            </Card>

            {/* Priority Topics */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-amber-500" />
                  优先复习专题
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activePlan.priority_topics && activePlan.priority_topics.length > 0 ? (
                  <div className="space-y-2">
                    {activePlan.priority_topics.map((topic, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{topic.topic}</span>
                          <Badge variant={
                            topic.priority === "高" ? "destructive" :
                            topic.priority === "中" ? "default" : "secondary"
                          } className="text-[10px]">
                            {topic.priority}优先
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{topic.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">暂无优先复习专题</p>
                )}
              </CardContent>
            </Card>

            {/* History */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">历史复习计划</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {plans.filter((p) => p.id !== activePlan.id).slice(0, 5).map((plan) => (
                    <div key={plan.id} className="flex items-center justify-between rounded-lg border p-2">
                      <div>
                        <p className="text-xs font-medium">{plan.plan_title}</p>
                        <p className="text-[10px] text-muted-foreground">{plan.subject}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {plan.status === "completed" ? "已完成" : plan.status}
                      </Badge>
                    </div>
                  ))}
                  {plans.filter((p) => p.id !== activePlan.id).length === 0 && (
                    <p className="text-xs text-muted-foreground">暂无历史计划</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
