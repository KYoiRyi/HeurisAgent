"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity, Bot, ArrowRight, Clock, CheckCircle2, AlertCircle,
  Loader2, RefreshCw, Network, Power, Plus, Play, Pause, Trash2, Terminal
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

// ─── Constants & Types ───────────────────────────────────────────────────────

interface AgentTask {
  id: string; task_type: string; source_agent: string; target_agent: string | null;
  status: string; priority: string; input_data: Record<string, unknown> | null;
  created_at: string; completed_at: string | null;
}

interface DaemonStatus {
  running: boolean; jobCount: number; runningTasks: number; memoryCount: number;
}

interface CronJob {
  id: number; name: string; schedule: string; prompt: string;
  enabled: boolean; next_run: string | null; run_count: number;
}

interface AgentEvent {
  type: string; payload: any; ts: string;
}

const AGENT_INFO: Record<string, { name: string; color: string; description: string }> = {
  classroom_agent: { name: "课堂互动智能体", color: "bg-emerald-500", description: "提问解答、知识点" },
  error_agent: { name: "错题管理智能体", color: "bg-orange-500", description: "错因分析、建议" },
  review_agent: { name: "复习策略智能体", color: "bg-purple-500", description: "复习计划、策略" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending: { label: "待处理", icon: Clock, color: "text-yellow-500" },
  running: { label: "运行中", icon: Loader2, color: "text-blue-500" },
  completed: { label: "已完成", icon: CheckCircle2, color: "text-green-500" },
  failed: { label: "失败", icon: AlertCircle, color: "text-red-500" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function MonitorPage() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [daemon, setDaemon] = useState<DaemonStatus | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New cron form
  const [newCronName, setNewCronName] = useState("");
  const [newCronSchedule, setNewCronSchedule] = useState("");
  const [newCronPrompt, setNewCronPrompt] = useState("");

  const eventsEndRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [resTasks, resStatus, resCron] = await Promise.all([
        fetch("/api/agent-tasks").catch(() => null),
        fetch("/api/agent/status").catch(() => null),
        fetch("/api/agent/cron").catch(() => null),
      ]);
      if (resTasks?.ok) setTasks((await resTasks.json()).data || []);
      if (resStatus?.ok) setDaemon((await resStatus.json()).data || null);
      if (resCron?.ok) setCronJobs((await resCron.json()).data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    // SSE Subscription
    const es = new EventSource("/api/agent/events");
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "connected") return;
        setEvents((prev) => [...prev, ev].slice(-50)); // keep last 50
        if (ev.type === "status" && ev.payload.running !== undefined) {
          setDaemon((prev) => prev ? { ...prev, running: ev.payload.running } : null);
        }
      } catch (err) {}
    };
    return () => es.close();
  }, [fetchAll]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const toggleDaemon = async () => {
    if (!daemon) return;
    const action = daemon.running ? "stop" : "start";
    const res = await fetch("/api/agent/status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) setDaemon((await res.json()).data);
  };

  const createCron = async () => {
    if (!newCronName || !newCronSchedule || !newCronPrompt) return;
    const res = await fetch("/api/agent/cron", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCronName, schedule: newCronSchedule, prompt: newCronPrompt }),
    });
    if (res.ok) {
      setNewCronName(""); setNewCronSchedule(""); setNewCronPrompt("");
      fetchAll();
    }
  };

  const toggleCron = async (id: number, enabled: boolean) => {
    await fetch("/api/agent/cron", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    fetchAll();
  };

  const deleteCron = async (id: number) => {
    await fetch("/api/agent/cron", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchAll();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-rose-500" />
            智能体监控与后台
          </h1>
          <p className="text-muted-foreground mt-1">后台 Daemon · 定时任务 · 实时日志流</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={daemon?.running ? "destructive" : "default"} onClick={toggleDaemon} className="gap-2">
            <Power className="h-4 w-4" />
            {daemon?.running ? "停止后台 Daemon" : "启动后台 Daemon"}
          </Button>
          <Button size="sm" variant="outline" onClick={fetchAll}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />刷新
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={daemon?.running ? "border-green-500/50 bg-green-500/5" : ""}>
          <CardContent className="p-5 flex flex-col items-center justify-center">
            <Power className={`h-8 w-8 mb-2 ${daemon?.running ? "text-green-500" : "text-muted-foreground"}`} />
            <p className="text-2xl font-bold">{daemon?.running ? "运行中" : "已停止"}</p>
            <p className="text-xs text-muted-foreground">Daemon 状态</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col items-center justify-center">
            <Clock className="h-8 w-8 mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{daemon?.jobCount || 0}</p>
            <p className="text-xs text-muted-foreground">活跃定时任务</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col items-center justify-center">
            <Loader2 className={`h-8 w-8 mb-2 text-orange-500 ${daemon?.runningTasks ? "animate-spin" : ""}`} />
            <p className="text-2xl font-bold">{daemon?.runningTasks || 0}</p>
            <p className="text-xs text-muted-foreground">当前运行中任务</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col items-center justify-center">
            <Bot className="h-8 w-8 mb-2 text-purple-500" />
            <p className="text-2xl font-bold">{daemon?.memoryCount || 0}</p>
            <p className="text-xs text-muted-foreground">记忆碎片数量</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="daemon">
        <TabsList>
          <TabsTrigger value="daemon">后台与定时任务</TabsTrigger>
          <TabsTrigger value="tasks">协同任务记录</TabsTrigger>
          <TabsTrigger value="flow">协作拓扑图</TabsTrigger>
        </TabsList>

        {/* Daemon & Cron Tab */}
        <TabsContent value="daemon" className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Cron Jobs */}
          <Card className="h-[500px] flex flex-col">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                后台定时任务
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-4 space-y-4">
              {/* Add form */}
              <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
                <p className="text-xs font-semibold">新建任务</p>
                <Input placeholder="任务名称 (如: 晚间总结)" value={newCronName} onChange={(e) => setNewCronName(e.target.value)} className="h-8 text-xs" />
                <Input placeholder="调度 (如: every 1h, 0 20 * * *)" value={newCronSchedule} onChange={(e) => setNewCronSchedule(e.target.value)} className="h-8 text-xs" />
                <Input placeholder="提示词 (你想让AI做什么?)" value={newCronPrompt} onChange={(e) => setNewCronPrompt(e.target.value)} className="h-8 text-xs" />
                <Button size="sm" className="w-full h-8 text-xs" onClick={createCron}><Plus className="h-3 w-3 mr-1" /> 添加任务</Button>
              </div>
              
              {/* Job list */}
              <div className="space-y-2">
                {cronJobs.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">暂无定时任务</p>}
                {cronJobs.map((job) => (
                  <div key={job.id} className="border rounded-lg p-3 space-y-2 text-sm">
                    <div className="flex justify-between items-start">
                      <div className="font-semibold">{job.name}</div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleCron(job.id, !job.enabled)}>
                          {job.enabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-600" onClick={() => deleteCron(job.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground flex justify-between">
                      <span>调度: {job.schedule}</span>
                      <Badge variant={job.enabled ? "default" : "secondary"} className="text-[10px]">{job.enabled ? "启用" : "禁用"}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground bg-muted p-1.5 rounded truncate" title={job.prompt}>
                      &gt; {job.prompt}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex justify-between">
                      <span>运行次数: {job.run_count}</span>
                      <span>下次: {job.next_run ? new Date(job.next_run).toLocaleString("zh-CN") : "无"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Right: Live Event Feed */}
          <Card className="h-[500px] flex flex-col bg-[#1e1e1e] text-green-400 border-none">
            <CardHeader className="pb-3 border-b border-white/10">
              <CardTitle className="text-base flex items-center gap-2 text-white/90">
                <Terminal className="h-4 w-4" />
                后台实时日志流
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed space-y-2">
              {events.length === 0 ? (
                <div className="text-white/30">等待后台事件推送...</div>
              ) : (
                events.map((ev, i) => (
                  <div key={i} className="break-all">
                    <span className="text-blue-400">[{new Date(ev.ts).toLocaleTimeString("zh-CN")}]</span>{" "}
                    <span className="text-purple-400">[{ev.type.toUpperCase()}]</span>{" "}
                    {ev.type === "task_start" && `任务开始 (ID: ${ev.payload.runId}) - ${ev.payload.prompt}`}
                    {ev.type === "task_done" && <span className="text-green-300">任务完成 (ID: ${ev.payload.runId}) - 输出: {ev.payload.result}</span>}
                    {ev.type === "task_error" && <span className="text-red-400">任务失败 (ID: ${ev.payload.runId}) - 错误: {ev.payload.error}</span>}
                    {ev.type === "status" && <span className="text-yellow-300">{ev.payload.message}</span>}
                  </div>
                ))
              )}
              <div ref={eventsEndRef} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Task History Tab */}
        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              {tasks.length === 0 && <p className="text-center text-muted-foreground py-8">暂无协同任务</p>}
              {tasks.map((task) => {
                const StatusIcon = STATUS_CONFIG[task.status]?.icon || Clock;
                return (
                  <div key={task.id} className="border rounded-lg p-3 flex gap-4 items-center">
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{task.task_type}</span>
                        <Badge variant="outline" className="text-[10px]">{STATUS_CONFIG[task.status]?.label || task.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {task.source_agent} {task.target_agent ? `→ ${task.target_agent}` : ""}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(task.created_at).toLocaleString("zh-CN")}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Flow Tab */}
        <TabsContent value="flow" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Network className="h-4 w-4" /> 智能体协作流程</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-4 py-8 overflow-x-auto">
                {Object.values(AGENT_INFO).map((agent, i, arr) => (
                  <React.Fragment key={agent.name}>
                    <div className="flex flex-col items-center gap-2 min-w-[120px]">
                      <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${agent.color}/10 border-2 border-primary/20`}>
                        <Bot className={`h-8 w-8 ${agent.color.replace("bg-", "text-").replace("500", "500")}`} />
                      </div>
                      <span className="text-sm font-medium">{agent.name}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex flex-col items-center">
                        <ArrowRight className="h-6 w-6 text-muted-foreground animate-pulse" />
                        <span className="text-[10px] text-muted-foreground mt-1">数据互通</span>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
