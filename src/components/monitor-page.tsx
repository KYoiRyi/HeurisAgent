"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Activity, Bot, ArrowRight, Clock, CheckCircle2, AlertCircle,
  Loader2, RefreshCw, Zap, Network, BarChart3
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AgentTask {
  id: string;
  task_type: string;
  source_agent: string;
  target_agent: string | null;
  status: string;
  priority: string;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  related_record_ids: string[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

const AGENT_INFO: Record<string, { name: string; color: string; description: string }> = {
  classroom_agent: {
    name: "课堂互动智能体",
    color: "bg-emerald-500",
    description: "实时提问解答、知识点联动讲解、启发式引导",
  },
  error_agent: {
    name: "错题管理智能体",
    color: "bg-orange-500",
    description: "错题收集分类、错因分析、针对性强化建议",
  },
  review_agent: {
    name: "复习策略智能体",
    color: "bg-purple-500",
    description: "个性化复习计划、知识盲点提示、复习策略生成",
  },
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: "待处理", icon: Clock, color: "text-yellow-500" },
  running: { label: "运行中", icon: Loader2, color: "text-blue-500" },
  completed: { label: "已完成", icon: CheckCircle2, color: "text-green-500" },
  failed: { label: "失败", icon: AlertCircle, color: "text-red-500" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "低", color: "bg-gray-100 text-gray-600" },
  normal: { label: "普通", color: "bg-blue-100 text-blue-600" },
  high: { label: "高", color: "bg-orange-100 text-orange-600" },
  urgent: { label: "紧急", color: "bg-red-100 text-red-600" },
};

const TASK_TYPE_MAP: Record<string, string> = {
  classify_error: "错题分类",
  analyze_weakness: "薄弱点分析",
  generate_plan: "生成复习计划",
  coordinate: "协同调度",
};

export default function MonitorPage() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/agent-tasks");
      const json = await res.json();
      if (json.success) setTasks(json.data);
    } catch (err) {
      console.error("Fetch tasks error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000); // Auto refresh
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const taskStats = {
    pending: tasks.filter((t) => t.status === "pending").length,
    running: tasks.filter((t) => t.status === "running").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    failed: tasks.filter((t) => t.status === "failed").length,
  };

  const agentStats = Object.keys(AGENT_INFO).map((agentKey) => ({
    key: agentKey,
    ...AGENT_INFO[agentKey],
    tasks: tasks.filter((t) => t.source_agent === agentKey || t.target_agent === agentKey).length,
    completed: tasks.filter((t) => (t.source_agent === agentKey || t.target_agent === agentKey) && t.status === "completed").length,
  }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-rose-500" />
            智能体协作监控
          </h1>
          <p className="text-muted-foreground mt-1">多智能体协同状态 · 任务流转监控 · 数据互通追踪</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1 animate-pulse" />
            实时监控
          </Badge>
          <Button size="sm" variant="outline" onClick={fetchTasks}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />刷新
          </Button>
        </div>
      </div>

      {/* Agent Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {agentStats.map((agent) => (
          <Card key={agent.key} className="relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-1 ${agent.color}`} />
            <CardContent className="p-5 pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${agent.color}/10`}>
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{agent.name}</h3>
                      <p className="text-[10px] text-muted-foreground">{agent.description}</p>
                    </div>
                  </div>
                </div>
                <Badge variant="default" className="text-[10px] bg-green-500">
                  <div className="h-1.5 w-1.5 rounded-full bg-white mr-1 animate-pulse" />
                  在线
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="text-center rounded-lg bg-muted/50 p-2">
                  <p className="text-lg font-bold">{agent.tasks}</p>
                  <p className="text-[10px] text-muted-foreground">关联任务</p>
                </div>
                <div className="text-center rounded-lg bg-muted/50 p-2">
                  <p className="text-lg font-bold">{agent.completed}</p>
                  <p className="text-[10px] text-muted-foreground">已完成</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Collaboration Flow */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            智能体协作流程
          </CardTitle>
          <CardDescription>多智能体间的数据互通与任务协同路径</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-2 sm:gap-4 py-4 overflow-x-auto">
            <div className="flex flex-col items-center gap-2 min-w-[100px]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30">
                <Bot className="h-7 w-7 text-emerald-500" />
              </div>
              <span className="text-xs font-medium">课堂智能体</span>
              <span className="text-[10px] text-muted-foreground">提问数据</span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <ArrowRight className="h-5 w-5 text-primary" />
              <span className="text-[10px] text-muted-foreground">知识点联动</span>
            </div>

            <div className="flex flex-col items-center gap-2 min-w-[100px]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 border-2 border-orange-500/30">
                <Bot className="h-7 w-7 text-orange-500" />
              </div>
              <span className="text-xs font-medium">错题智能体</span>
              <span className="text-[10px] text-muted-foreground">错因分析</span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <ArrowRight className="h-5 w-5 text-primary" />
              <span className="text-[10px] text-muted-foreground">薄弱点传递</span>
            </div>

            <div className="flex flex-col items-center gap-2 min-w-[100px]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10 border-2 border-purple-500/30">
                <Bot className="h-7 w-7 text-purple-500" />
              </div>
              <span className="text-xs font-medium">复习智能体</span>
              <span className="text-[10px] text-muted-foreground">复习策略</span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <ArrowRight className="h-5 w-5 text-primary" />
              <span className="text-[10px] text-muted-foreground">盲点反馈</span>
            </div>

            <div className="flex flex-col items-center gap-2 min-w-[100px]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30">
                <Bot className="h-7 w-7 text-emerald-500" />
              </div>
              <span className="text-xs font-medium">课堂智能体</span>
              <span className="text-[10px] text-muted-foreground">重点关注</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Stats & List */}
      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">任务列表</TabsTrigger>
          <TabsTrigger value="stats">任务统计</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4">
          <div className="space-y-3">
            {loading ? (
              <Card><CardContent className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>
            ) : tasks.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Activity className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">暂无智能体协同任务</p>
                  <p className="text-xs text-muted-foreground mt-1">当智能体间需要数据互通时会自动创建协同任务</p>
                </CardContent>
              </Card>
            ) : (
              tasks.map((task) => {
                const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
                const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal;
                const StatusIcon = statusConfig.icon;

                return (
                  <Card key={task.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${AGENT_INFO[task.source_agent]?.color || "bg-gray-500"}/10`}>
                          <Bot className={`h-4 w-4 ${AGENT_INFO[task.source_agent]?.color ? "text-white" : "text-gray-500"}`} />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {TASK_TYPE_MAP[task.task_type] || task.task_type}
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusConfig.color}`}>
                              <StatusIcon className={`h-2.5 w-2.5 ${task.status === "running" ? "animate-spin" : ""}`} />
                              {statusConfig.label}
                            </span>
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${priorityConfig.color}`}>
                              {priorityConfig.label}优先
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{AGENT_INFO[task.source_agent]?.name || task.source_agent}</span>
                            {task.target_agent && (
                              <>
                                <ArrowRight className="h-3 w-3" />
                                <span>{AGENT_INFO[task.target_agent]?.name || task.target_agent}</span>
                              </>
                            )}
                          </div>

                          {task.input_data && (
                            <div className="rounded-lg bg-muted/50 p-2 text-xs">
                              <p className="text-muted-foreground mb-1">输入数据：</p>
                              <pre className="text-[10px] overflow-auto max-h-20">
                                {JSON.stringify(task.input_data, null, 2).substring(0, 200)}
                              </pre>
                            </div>
                          )}

                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span>创建: {new Date(task.created_at).toLocaleString("zh-CN")}</span>
                            {task.completed_at && (
                              <span>完成: {new Date(task.completed_at).toLocaleString("zh-CN")}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(taskStats).map(([key, value]) => {
              const config = STATUS_CONFIG[key];
              const Icon = config.icon;
              return (
                <Card key={key}>
                  <CardContent className="p-5 text-center">
                    <Icon className={`h-8 w-8 mx-auto mb-2 ${config.color} ${key === "running" ? "animate-spin" : ""}`} />
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground">{config.label}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
