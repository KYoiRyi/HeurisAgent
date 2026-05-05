"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from "recharts";
import {
  LayoutDashboard, BookOpen, BookX, CalendarCheck, Users,
  TrendingUp, AlertCircle, CheckCircle2, Clock, Sparkles,
  ArrowUpRight, Brain, Target
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DashboardData {
  overview: {
    totalResources: number;
    totalErrors: number;
    activePlans: number;
    activeSessions: number;
  };
  errorTypeStats: Record<string, number>;
  subjectStats: Record<string, number>;
  taskStats: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  agentActivity: Record<string, number>;
  dailyStats: Record<string, { classroom: number; error: number; review: number; resource: number }>;
  studentData: {
    totalErrors: number;
    masteredErrors: number;
    masteryRate: number;
    recentRecords: Array<{ record_type: string; created_at: string }>;
    activePlans: Array<{ plan_title: string; subject: string; status: string; progress: number; total_tasks: number; completed_tasks: number }>;
  } | null;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const AGENT_NAMES: Record<string, string> = {
  classroom_agent: "课堂智能体",
  error_agent: "错题智能体",
  review_agent: "复习智能体",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [studentName, setStudentName] = useState("张三");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard?student_name=${encodeURIComponent(studentName)}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [studentName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const { overview, errorTypeStats, subjectStats, taskStats, agentActivity, dailyStats, studentData } = data;

  // 准备图表数据
  const errorTypeChartData = Object.entries(errorTypeStats).map(([name, value]) => ({ name, value }));
  const subjectChartData = Object.entries(subjectStats).map(([name, value]) => ({ name, value }));
  const dailyChartData = Object.entries(dailyStats).map(([date, stats]) => ({
    date: date.substring(5),
    课堂: stats.classroom,
    错题: stats.error,
    复习: stats.review,
    资源: stats.resource,
  }));
  const taskChartData = [
    { name: "待处理", value: taskStats.pending, fill: "#f59e0b" },
    { name: "运行中", value: taskStats.running, fill: "#3b82f6" },
    { name: "已完成", value: taskStats.completed, fill: "#10b981" },
    { name: "失败", value: taskStats.failed, fill: "#ef4444" },
  ];
  const agentChartData = Object.entries(agentActivity).map(([key, value]) => ({
    name: AGENT_NAMES[key] || key,
    value,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            学习仪表盘
          </h1>
          <p className="text-muted-foreground mt-1">多智能体协作 · 启发式学习 · 实时数据洞察</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="输入学生姓名"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className="w-40"
          />
          <Button size="sm" onClick={fetchData}>查询</Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "教学资源", value: overview.totalResources, icon: BookOpen, color: "text-cyan-500", bg: "bg-cyan-500/10", change: "+3 本周" },
          { title: "错题记录", value: overview.totalErrors, icon: BookX, color: "text-orange-500", bg: "bg-orange-500/10", change: `${studentData?.masteryRate || 0}% 掌握率` },
          { title: "复习计划", value: overview.activePlans, icon: CalendarCheck, color: "text-purple-500", bg: "bg-purple-500/10", change: "进行中" },
          { title: "活跃课堂", value: overview.activeSessions, icon: Users, color: "text-emerald-500", bg: "bg-emerald-500/10", change: "实时" },
        ].map((card) => (
          <Card key={card.title} className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs text-muted-foreground">{card.change}</span>
                  </div>
                </div>
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", card.bg)}>
                  <card.icon className={cn("h-5 w-5", card.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Student Progress */}
      {studentData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              {studentName} 的学习进度
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">错题掌握率</span>
                  <span className="font-semibold">{studentData.masteryRate}%</span>
                </div>
                <Progress value={studentData.masteryRate} className="h-2" />
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>已掌握 {studentData.masteredErrors}</span>
                  <span>总计 {studentData.totalErrors}</span>
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">活跃复习计划</span>
                {studentData.activePlans.length > 0 ? studentData.activePlans.map((plan, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border p-2">
                    <div>
                      <p className="text-sm font-medium">{plan.plan_title}</p>
                      <p className="text-xs text-muted-foreground">{plan.subject}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{plan.completed_tasks}/{plan.total_tasks}</Badge>
                  </div>
                )) : <p className="text-xs text-muted-foreground">暂无活跃计划</p>}
              </div>
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">最近学习记录</span>
                <div className="space-y-1.5">
                  {studentData.recentRecords.slice(0, 5).map((record, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {record.record_type === "classroom" && <MessageSquareIcon className="h-3 w-3 text-emerald-500" />}
                      {record.record_type === "error" && <BookX className="h-3 w-3 text-orange-500" />}
                      {record.record_type === "review" && <CalendarCheck className="h-3 w-3 text-purple-500" />}
                      <span className="text-muted-foreground">
                        {new Date(record.created_at).toLocaleDateString("zh-CN")}
                      </span>
                      <Badge variant="secondary" className="text-[10px] h-4">
                        {record.record_type === "classroom" ? "课堂" :
                         record.record_type === "error" ? "错题" :
                         record.record_type === "review" ? "复习" : "资源"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Grid */}
      <Tabs defaultValue="trend" className="w-full">
        <TabsList>
          <TabsTrigger value="trend">学习趋势</TabsTrigger>
          <TabsTrigger value="errors">错题分析</TabsTrigger>
          <TabsTrigger value="agents">智能体活动</TabsTrigger>
        </TabsList>

        <TabsContent value="trend" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">近7天学习活动趋势</CardTitle>
                <CardDescription>各类学习活动的每日统计</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={12} tickLine={false} />
                    <YAxis fontSize={12} tickLine={false} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="课堂" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="错题" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="复习" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">学科分布</CardTitle>
                <CardDescription>各学科学习记录占比</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={subjectChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {subjectChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="errors" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">错题类型分布</CardTitle>
                <CardDescription>各类错误占比统计</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={errorTypeChartData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {errorTypeChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">错题类型柱状图</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={errorTypeChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" fontSize={12} tickLine={false} />
                    <YAxis fontSize={12} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">智能体任务状态</CardTitle>
                <CardDescription>协同任务的执行情况</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={taskChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label>
                      {taskChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">智能体活跃度</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={agentChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={12} />
                    <YAxis type="category" dataKey="name" fontSize={12} width={80} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {agentChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function cn(...inputs: (string | undefined | false)[]) {
  return inputs.filter(Boolean).join(" ");
}

function MessageSquareIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
