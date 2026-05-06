"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  BookOpen,
  BookX,
  Brain,
  CalendarCheck,
  CheckCircle2,
  FileText,
  Gauge,
  Layers3,
  LayoutDashboard,
  MessageSquareText,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    activePlans: Array<{
      plan_title: string;
      subject: string;
      status: string;
      progress: number;
      total_tasks: number;
      completed_tasks: number;
    }>;
  };
  learningProfile: {
    knowledgePoints: string[];
    weakPoints: string[];
    recentTopics: string[];
    strongestSubject: string;
    activityScore: number;
  };
  source: "local" | "supabase";
}

type ChartPoint = { name: string; value: number; fill?: string; empty?: boolean };

const COLORS = ["#0891b2", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#2563eb"];
const AGENT_NAMES: Record<string, string> = {
  classroom_agent: "课堂智能体",
  error_agent: "错题智能体",
  review_agent: "复习智能体",
  heuris_agent: "Hermes 内核",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartData = useMemo(() => {
    if (!data) {
      return {
        errorTypes: [] as ChartPoint[],
        subjects: [] as ChartPoint[],
        agents: [] as ChartPoint[],
        daily: [],
        tasks: [] as ChartPoint[],
      };
    }

    const errorTypes = Object.entries(data.errorTypeStats).map(([name, value]) => ({ name, value }));
    const subjects = Object.entries(data.subjectStats).map(([name, value]) => ({ name, value }));
    const agents = Object.entries(data.agentActivity).map(([key, value]) => ({
      name: AGENT_NAMES[key] || key,
      value,
    }));

    return {
      errorTypes,
      subjects,
      agents,
      daily: Object.entries(data.dailyStats).map(([date, stats]) => ({
        date: date.substring(5),
        课堂: stats.classroom,
        错题: stats.error,
        复习: stats.review,
        资源: stats.resource,
      })),
      tasks: [
        { name: "待处理", value: data.taskStats.pending, fill: "#f59e0b" },
        { name: "运行中", value: data.taskStats.running, fill: "#2563eb" },
        { name: "已完成", value: data.taskStats.completed, fill: "#16a34a" },
        { name: "失败", value: data.taskStats.failed, fill: "#dc2626" },
      ],
    };
  }, [data]);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="animate-pulse">
          <CardContent className="p-6">
            <div className="h-80 rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const { overview, studentData, learningProfile } = data;
  const errorTypeChartData = withPieFallback(chartData.errorTypes, "暂无错题");
  const subjectChartData = withPieFallback(chartData.subjects, "暂无学科");
  const taskChartData = withPieFallback(chartData.tasks.filter((item) => item.value > 0), "暂无任务");
  const agentChartData = withBarFallback(chartData.agents, "暂无活动");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 py-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <LayoutDashboard className="h-5 w-5 text-primary" />
            </span>
          </div>
          <h1 className="text-3xl font-semibold md:text-4xl">启发式学业智能体</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 md:min-w-[420px]">
          <MetricPill icon={Brain} label="知识点" value={learningProfile.knowledgePoints.length} />
          <MetricPill icon={Target} label="薄弱点" value={learningProfile.weakPoints.length} />
          <MetricPill icon={Gauge} label="活跃度" value={learningProfile.activityScore} suffix="%" />
          <MetricPill icon={Layers3} label="主学科" value={learningProfile.strongestSubject} />
        </div>
      </div>

      <LearningPortrait data={data} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "教学资源", value: overview.totalResources, icon: BookOpen, color: "text-cyan-600", bg: "bg-cyan-500/10", change: "资料库" },
          { title: "错题记录", value: overview.totalErrors, icon: BookX, color: "text-orange-600", bg: "bg-orange-500/10", change: `${studentData.masteryRate}% 掌握率` },
          { title: "复习计划", value: overview.activePlans, icon: CalendarCheck, color: "text-violet-600", bg: "bg-violet-500/10", change: "进行中" },
          { title: "活跃课堂", value: overview.activeSessions, icon: Users, color: "text-emerald-600", bg: "bg-emerald-500/10", change: "按学科留存" },
        ].map((card) => (
          <Card key={card.title} className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="mt-1 text-3xl font-bold">{card.value}</p>
                  <div className="mt-2 flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs text-muted-foreground">{card.change}</span>
                  </div>
                </div>
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", card.bg)}>
                  <card.icon className={cn("h-5 w-5", card.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            综合学习进度
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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
              {studentData.activePlans.length > 0 ? (
                studentData.activePlans.slice(0, 3).map((plan, i) => (
                  <div key={`${plan.plan_title}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border p-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{plan.plan_title}</p>
                      <p className="text-xs text-muted-foreground">{plan.subject}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {plan.completed_tasks}/{plan.total_tasks}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">暂无活跃计划</p>
              )}
            </div>
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">最近学习记录</span>
              <div className="space-y-1.5">
                {studentData.recentRecords.length > 0 ? (
                  studentData.recentRecords.slice(0, 5).map((record, i) => {
                    const Icon = recordIcon(record.record_type);
                    return (
                      <div key={`${record.record_type}-${record.created_at}-${i}`} className="flex items-center gap-2 text-xs">
                        <Icon className={cn("h-3 w-3", recordColor(record.record_type))} />
                        <span className="text-muted-foreground">{formatDate(record.created_at)}</span>
                        <Badge variant="secondary" className="h-4 text-[10px]">
                          {recordLabel(record.record_type)}
                        </Badge>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">暂无学习记录</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="trend" className="w-full">
        <TabsList>
          <TabsTrigger value="trend">学习趋势</TabsTrigger>
          <TabsTrigger value="errors">错题分析</TabsTrigger>
          <TabsTrigger value="agents">智能体活动</TabsTrigger>
        </TabsList>

        <TabsContent value="trend" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">近7天学习活动趋势</CardTitle>
                <CardDescription>课堂、错题、复习和资源的每日统计</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" fontSize={12} tickLine={false} />
                    <YAxis fontSize={12} tickLine={false} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="课堂" stackId="1" stroke="#16a34a" fill="#16a34a" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="错题" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="复习" stackId="1" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.18} />
                    <Area type="monotone" dataKey="资源" stackId="1" stroke="#0891b2" fill="#0891b2" fillOpacity={0.16} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">学科分布</CardTitle>
                <CardDescription>按已有课堂、资料和复习计划汇总</CardDescription>
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
                    >
                      {subjectChartData.map((entry, index) => (
                        <Cell key={`subject-${entry.name}`} fill={entry.empty ? "#94a3b8" : COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="errors" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">错题类型分布</CardTitle>
                <CardDescription>从错题记忆和题目分析中汇总</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={errorTypeChartData} cx="50%" cy="50%" outerRadius={100} dataKey="value">
                      {errorTypeChartData.map((entry, index) => (
                        <Cell key={`error-${entry.name}`} fill={entry.empty ? "#94a3b8" : COLORS[index % COLORS.length]} />
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
                <CardTitle className="text-base">错题类型柱状图</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={withBarFallback(chartData.errorTypes, "暂无错题")}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" fontSize={12} tickLine={false} interval={0} />
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">智能体任务状态</CardTitle>
                <CardDescription>Hermes 任务与协同任务执行情况</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={taskChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value">
                      {taskChartData.map((entry, index) => (
                        <Cell key={`task-${entry.name}`} fill={entry.empty ? "#94a3b8" : entry.fill || COLORS[index % COLORS.length]} />
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
                    <YAxis type="category" dataKey="name" fontSize={12} width={90} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {agentChartData.map((entry, index) => (
                        <Cell key={`agent-${entry.name}`} fill={entry.empty ? "#94a3b8" : COLORS[index % COLORS.length]} />
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

function LearningPortrait({ data }: { data: DashboardData }) {
  const { overview, learningProfile, studentData, agentActivity } = data;
  const score = clamp(learningProfile.activityScore, 0, 100);
  const classroomCount = agentActivity.classroom_agent ?? overview.activeSessions;
  const errorCount = agentActivity.error_agent ?? overview.totalErrors;
  const reviewCount = agentActivity.review_agent ?? overview.activePlans;
  const resourceCount = overview.totalResources;
  const maxMetricValue = Math.max(1, classroomCount, errorCount, reviewCount, resourceCount);
  const metrics = [
    {
      label: "课堂互动",
      value: classroomCount,
      icon: MessageSquareText,
      iconClassName: "bg-emerald-500/10 text-emerald-600",
      barClassName: "bg-emerald-500",
    },
    {
      label: "错题沉淀",
      value: errorCount,
      icon: BookX,
      iconClassName: "bg-amber-500/10 text-amber-600",
      barClassName: "bg-amber-500",
    },
    {
      label: "复习计划",
      value: reviewCount,
      icon: CalendarCheck,
      iconClassName: "bg-violet-500/10 text-violet-600",
      barClassName: "bg-violet-500",
    },
    {
      label: "课堂资料",
      value: resourceCount,
      icon: BookOpen,
      iconClassName: "bg-cyan-500/10 text-cyan-600",
      barClassName: "bg-cyan-500",
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(280px,0.95fr)_1.05fr]">
        <div className="rounded-lg border bg-slate-50 p-4 dark:bg-zinc-950">
          <div className="grid gap-4 xl:grid-cols-[240px_1fr]">
            <div className="rounded-lg border bg-white p-5 shadow-sm dark:bg-zinc-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">学习活跃度</p>
                  <p className="mt-1 text-xl font-semibold">{learningProfile.strongestSubject}</p>
                </div>
                <Badge variant="outline">{score}%</Badge>
              </div>
              <div className="mx-auto mt-5 flex h-36 w-36 items-center justify-center rounded-full p-3" style={{ background: `conic-gradient(#059669 ${score * 3.6}deg, #e2e8f0 0deg)` }}>
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center shadow-inner dark:bg-zinc-900">
                  <span className="text-4xl font-semibold">{score}</span>
                  <span className="text-xs text-muted-foreground">综合分</span>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-slate-100 p-3 dark:bg-zinc-800">
                  <p className="text-xs text-muted-foreground">错题掌握</p>
                  <p className="mt-1 font-semibold">{studentData.masteryRate}%</p>
                </div>
                <div className="rounded-md bg-slate-100 p-3 dark:bg-zinc-800">
                  <p className="text-xs text-muted-foreground">知识点</p>
                  <p className="mt-1 font-semibold">{learningProfile.knowledgePoints.length} 个</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {metrics.map((metric) => (
                <PortraitMetricCard
                  key={metric.label}
                  icon={metric.icon}
                  label={metric.label}
                  value={metric.value}
                  iconClassName={metric.iconClassName}
                  barClassName={metric.barClassName}
                  percent={Math.max(6, Math.round((metric.value / maxMetricValue) * 100))}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <PortraitSection
            icon={Brain}
            title="知识点"
            empty="暂无知识点记录"
            items={learningProfile.knowledgePoints}
            tone="cyan"
          />
          <PortraitSection
            icon={Target}
            title="薄弱点"
            empty="暂无薄弱点记录"
            items={learningProfile.weakPoints}
            tone="orange"
          />
          <PortraitSection
            icon={FileText}
            title="主题"
            empty="暂无主题记录"
            items={learningProfile.recentTopics}
            tone="emerald"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PortraitMetricCard({
  icon: Icon,
  label,
  value,
  iconClassName,
  barClassName,
  percent,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  iconClassName: string;
  barClassName: string;
  percent: number;
}) {
  return (
    <div className="flex min-h-[118px] flex-col justify-between rounded-lg border bg-white p-4 shadow-sm dark:bg-zinc-900">
      <div className="flex items-start gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconClassName)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="truncate text-sm font-medium">{label}</p>
            <span className="shrink-0 text-2xl font-semibold leading-none">{value}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 h-2 rounded-full bg-slate-200 dark:bg-zinc-800">
        <div className={cn("h-2 rounded-full", barClassName)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function PortraitSection({
  icon: Icon,
  title,
  empty,
  items,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  empty: string;
  items: string[];
  tone: "cyan" | "orange" | "emerald";
}) {
  const color = {
    cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  }[tone];

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.slice(0, 8).map((item) => (
            <Badge key={item} variant="outline" className={cn("max-w-full truncate", color)}>
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function MetricPill({ icon: Icon, label, value, suffix = "" }: { icon: LucideIcon; label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">
        {value}
        {suffix}
      </div>
    </div>
  );
}

function withPieFallback(items: ChartPoint[], label: string): ChartPoint[] {
  return items.length > 0 ? items : [{ name: label, value: 1, empty: true }];
}

function withBarFallback(items: ChartPoint[], label: string): ChartPoint[] {
  return items.length > 0 ? items : [{ name: label, value: 0, empty: true }];
}

function recordIcon(type: string): LucideIcon {
  if (type === "classroom") return MessageSquareText;
  if (type === "error") return BookX;
  if (type === "review") return CalendarCheck;
  if (type === "resource") return BookOpen;
  return CheckCircle2;
}

function recordColor(type: string) {
  if (type === "classroom") return "text-emerald-500";
  if (type === "error") return "text-orange-500";
  if (type === "review") return "text-violet-500";
  if (type === "resource") return "text-cyan-500";
  return "text-muted-foreground";
}

function recordLabel(type: string) {
  if (type === "classroom") return "课堂";
  if (type === "error") return "错题";
  if (type === "review") return "复习";
  if (type === "resource") return "资源";
  return "记录";
}

function formatDate(value: string) {
  const date = new Date(value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("zh-CN");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function cn(...inputs: (string | undefined | false)[]) {
  return inputs.filter(Boolean).join(" ");
}
