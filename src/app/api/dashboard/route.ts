import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getDb } from "@/lib/db";

interface DashboardResponseData {
  overview: {
    totalResources: number;
    totalErrors: number;
    activePlans: number;
    activeSessions: number;
  };
  errorTypeStats: Record<string, number>;
  subjectStats: Record<string, number>;
  taskStats: { pending: number; running: number; completed: number; failed: number };
  agentActivity: Record<string, number>;
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
  dailyStats: Record<string, { classroom: number; error: number; review: number; resource: number }>;
  learningProfile: {
    knowledgePoints: string[];
    weakPoints: string[];
    recentTopics: string[];
    strongestSubject: string;
    activityScore: number;
  };
  source: "local" | "supabase";
}

interface LocalResourceRow {
  title: string;
  subject: string;
  category: string;
  tags: string;
  created_at: string;
}

interface LocalMemoryRow {
  content: string;
  source: string;
  tags: string;
  created_at: string;
}

interface LocalClassroomRow {
  subject: string;
  role: string;
  session_id: string | null;
  related_knowledge_points: string;
  created_at: string;
}

interface LocalReviewPlanRow {
  plan_title: string;
  subject: string;
  status: string;
  progress: number;
  total_tasks: number;
  completed_tasks: number;
  blind_spots: string;
  priority_topics: string;
  created_at: string;
}

interface LocalTaskRunRow {
  status: string;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json({ success: true, data: buildLocalDashboard() });
    }

    const { searchParams } = new URL(request.url);
    const studentName = searchParams.get("student_name");

    const [
      { count: totalResources },
      { count: totalErrors },
      { count: totalPlans },
      { count: activeSessions },
    ] = await Promise.all([
      client.from("learning_resources").select("*", { count: "exact", head: true }),
      client.from("error_questions").select("*", { count: "exact", head: true }),
      client.from("review_plans").select("*", { count: "exact", head: true }).eq("status", "active"),
      client.from("classroom_sessions").select("*", { count: "exact", head: true }).eq("status", "active"),
    ]);

    const { data: errorTypeData } = await client.from("error_questions").select("error_type");
    const errorTypeStats: Record<string, number> = {};
    for (const item of errorTypeData ?? []) increment(errorTypeStats, item.error_type || "未分类");

    const { data: subjectData } = await client.from("learning_records").select("subject");
    const subjectStats: Record<string, number> = {};
    for (const item of subjectData ?? []) {
      if (item.subject) increment(subjectStats, item.subject);
    }

    const { data: taskData } = await client.from("agent_tasks").select("status, source_agent");
    const taskStats = { pending: 0, running: 0, completed: 0, failed: 0 };
    const agentActivity: Record<string, number> = {};
    for (const task of taskData ?? []) {
      if (task.status && task.status in taskStats) {
        taskStats[task.status as keyof typeof taskStats]++;
      }
      if (task.source_agent) increment(agentActivity, task.source_agent);
    }

    let studentData = emptyDashboard("supabase").studentData;
    if (studentName) {
      const [
        { count: studentErrors },
        { count: studentMastered },
        { data: studentRecords },
        { data: studentPlans },
      ] = await Promise.all([
        client.from("error_questions").select("*", { count: "exact", head: true }).eq("student_name", studentName),
        client.from("error_questions").select("*", { count: "exact", head: true }).eq("student_name", studentName).eq("mastered", true),
        client.from("learning_records").select("record_type, created_at").eq("student_name", studentName).order("created_at", { ascending: false }).limit(30),
        client.from("review_plans").select("plan_title, subject, status, progress, total_tasks, completed_tasks").eq("student_name", studentName).eq("status", "active"),
      ]);

      studentData = {
        totalErrors: studentErrors || 0,
        masteredErrors: studentMastered || 0,
        masteryRate: studentErrors ? Math.round(((studentMastered || 0) / studentErrors) * 100) : 0,
        recentRecords: studentRecords || [],
        activePlans: studentPlans || [],
      };
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: recentRecords } = await client
      .from("learning_records")
      .select("record_type, created_at")
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: true });

    const dailyStats = buildEmptyDailyStats();
    for (const record of recentRecords ?? []) {
      const type = record.record_type as "classroom" | "error" | "review" | "resource";
      if (record.created_at && type in dailyStats[Object.keys(dailyStats)[0]]) {
        addDaily(dailyStats, record.created_at, type);
      }
    }

    const remoteData: DashboardResponseData = {
      ...emptyDashboard("supabase"),
      overview: {
        totalResources: totalResources || 0,
        totalErrors: totalErrors || 0,
        activePlans: totalPlans || 0,
        activeSessions: activeSessions || 0,
      },
      errorTypeStats,
      subjectStats,
      taskStats,
      agentActivity,
      studentData,
      dailyStats,
      learningProfile: buildRemoteLearningProfile(subjectStats, errorTypeStats, studentData),
    };

    return NextResponse.json({ success: true, data: mergeDashboardData(buildLocalDashboard(), remoteData) });
  } catch (error) {
    console.error("[/api/dashboard]", error);
    return NextResponse.json({ success: true, data: buildLocalDashboard() });
  }
}

function buildLocalDashboard(): DashboardResponseData {
  const db = getDb();
  const resources = db.prepare(
    "SELECT title, subject, category, tags, created_at FROM learning_resources ORDER BY created_at DESC LIMIT 200"
  ).all() as LocalResourceRow[];
  const memories = db.prepare(
    "SELECT content, source, tags, created_at FROM memories ORDER BY created_at DESC LIMIT 400"
  ).all() as LocalMemoryRow[];
  const classroom = db.prepare(
    "SELECT subject, role, session_id, related_knowledge_points, created_at FROM classroom_history ORDER BY created_at DESC LIMIT 400"
  ).all() as LocalClassroomRow[];
  const plans = db.prepare(
    "SELECT plan_title, subject, status, progress, total_tasks, completed_tasks, blind_spots, priority_topics, created_at FROM review_plans ORDER BY created_at DESC LIMIT 80"
  ).all() as LocalReviewPlanRow[];
  const runs = db.prepare("SELECT status, started_at AS created_at FROM task_runs ORDER BY started_at DESC LIMIT 120").all() as LocalTaskRunRow[];

  const errorMemories = memories.filter((memory) =>
    memory.source === "error" ||
    memory.content.includes("[错题记录]") ||
    parseStringArray(memory.tags).includes("error-question")
  );
  const knowledgeMemories = memories.filter((memory) => {
    const tags = parseStringArray(memory.tags);
    return tags.includes("knowledge-point") || memory.content.includes("[课堂知识点]");
  });
  const weaknessMemories = memories.filter((memory) => {
    const tags = parseStringArray(memory.tags);
    return tags.includes("weakness") || memory.content.includes("薄弱") || memory.content.includes("错因");
  });

  const subjectStats: Record<string, number> = {};
  for (const row of classroom) increment(subjectStats, row.subject || "通用");
  for (const row of resources) increment(subjectStats, row.subject || "通用");
  for (const row of plans) increment(subjectStats, row.subject || "通用");

  const errorTypeStats: Record<string, number> = {};
  for (const memory of errorMemories) increment(errorTypeStats, readMemoryField(memory.content, "错误类型") || "未分类");

  const taskStats = { pending: 0, running: 0, completed: 0, failed: 0 };
  for (const run of runs) {
    if (run.status === "running") taskStats.running++;
    else if (run.status === "failed") taskStats.failed++;
    else if (run.status === "done") taskStats.completed++;
    else taskStats.pending++;
  }

  const dailyStats = buildEmptyDailyStats();
  for (const row of classroom) addDaily(dailyStats, row.created_at, "classroom");
  for (const row of errorMemories) addDaily(dailyStats, row.created_at, "error");
  for (const row of plans) addDaily(dailyStats, row.created_at, "review");
  for (const row of resources) addDaily(dailyStats, row.created_at, "resource");

  const sessionIds = new Set(classroom.map((row) => row.session_id).filter(Boolean));
  const activePlans = plans.filter((plan) => plan.status === "active");
  const recentRecords = [
    ...classroom.map((row) => ({ record_type: "classroom", created_at: row.created_at })),
    ...errorMemories.map((row) => ({ record_type: "error", created_at: row.created_at })),
    ...plans.map((row) => ({ record_type: "review", created_at: row.created_at })),
    ...resources.map((row) => ({ record_type: "resource", created_at: row.created_at })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 30);

  const knowledgePoints = unique([
    ...knowledgeMemories.flatMap((memory) => extractKnowledgePoints(memory.content, memory.tags)),
    ...classroom.flatMap((row) => parseStringArray(row.related_knowledge_points)),
    ...resources.flatMap((row) => parseStringArray(row.tags)),
  ]).filter((point) => point !== "knowledge-point").slice(0, 12);
  const weakPoints = unique([
    ...weaknessMemories.map((memory) => readMemoryField(memory.content, "知识点") || readMemoryField(memory.content, "题目") || memory.content),
    ...plans.flatMap((plan) => parseStringArray(plan.blind_spots)),
  ]).map((item) => compact(item, 24)).slice(0, 8);
  const recentTopics = unique([
    ...resources.map((resource) => resource.title),
    ...knowledgePoints,
    ...plans.flatMap((plan) => parsePriorityTopics(plan.priority_topics)),
  ]).map((item) => compact(item, 18)).slice(0, 8);

  const strongestSubject = Object.entries(subjectStats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "通用";
  const totalActivity = classroom.length + resources.length + errorMemories.length + plans.length;

  return {
    ...emptyDashboard("local"),
    overview: {
      totalResources: resources.length,
      totalErrors: errorMemories.length,
      activePlans: activePlans.length,
      activeSessions: sessionIds.size || (classroom.length > 0 ? 1 : 0),
    },
    errorTypeStats,
    subjectStats,
    taskStats,
    agentActivity: {
      classroom_agent: classroom.length,
      error_agent: errorMemories.length,
      review_agent: plans.length,
      heuris_agent: runs.length,
    },
    studentData: {
      totalErrors: errorMemories.length,
      masteredErrors: 0,
      masteryRate: errorMemories.length > 0 ? Math.max(10, Math.min(80, 100 - errorMemories.length * 8)) : 100,
      recentRecords,
      activePlans: activePlans.map((plan) => ({
        plan_title: plan.plan_title,
        subject: plan.subject,
        status: plan.status,
        progress: plan.progress,
        total_tasks: plan.total_tasks,
        completed_tasks: plan.completed_tasks,
      })),
    },
    dailyStats,
    learningProfile: {
      knowledgePoints,
      weakPoints,
      recentTopics,
      strongestSubject,
      activityScore: Math.min(100, Math.round(totalActivity * 8 + knowledgePoints.length * 4)),
    },
    source: "local",
  };
}

function emptyDashboard(source: "local" | "supabase"): DashboardResponseData {
  return {
    overview: { totalResources: 0, totalErrors: 0, activePlans: 0, activeSessions: 0 },
    errorTypeStats: {},
    subjectStats: {},
    taskStats: { pending: 0, running: 0, completed: 0, failed: 0 },
    agentActivity: {},
    studentData: { totalErrors: 0, masteredErrors: 0, masteryRate: 0, recentRecords: [], activePlans: [] },
    dailyStats: buildEmptyDailyStats(),
    learningProfile: {
      knowledgePoints: [],
      weakPoints: [],
      recentTopics: [],
      strongestSubject: "通用",
      activityScore: 0,
    },
    source,
  };
}

function buildEmptyDailyStats() {
  const days: Record<string, { classroom: number; error: number; review: number; resource: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days[date.toISOString().split("T")[0]] = { classroom: 0, error: 0, review: 0, resource: 0 };
  }
  return days;
}

function mergeDashboardData(local: DashboardResponseData, remote: DashboardResponseData): DashboardResponseData {
  return {
    ...remote,
    overview: {
      totalResources: remote.overview.totalResources + local.overview.totalResources,
      totalErrors: remote.overview.totalErrors + local.overview.totalErrors,
      activePlans: remote.overview.activePlans + local.overview.activePlans,
      activeSessions: remote.overview.activeSessions + local.overview.activeSessions,
    },
    errorTypeStats: mergeCounts(remote.errorTypeStats, local.errorTypeStats),
    subjectStats: mergeCounts(remote.subjectStats, local.subjectStats),
    taskStats: {
      pending: remote.taskStats.pending + local.taskStats.pending,
      running: remote.taskStats.running + local.taskStats.running,
      completed: remote.taskStats.completed + local.taskStats.completed,
      failed: remote.taskStats.failed + local.taskStats.failed,
    },
    agentActivity: mergeCounts(remote.agentActivity, local.agentActivity),
    dailyStats: mergeDaily(remote.dailyStats, local.dailyStats),
    studentData: {
      totalErrors: remote.studentData.totalErrors + local.studentData.totalErrors,
      masteredErrors: remote.studentData.masteredErrors + local.studentData.masteredErrors,
      masteryRate: Math.max(remote.studentData.masteryRate, local.studentData.masteryRate),
      recentRecords: [...remote.studentData.recentRecords, ...local.studentData.recentRecords]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 30),
      activePlans: [...remote.studentData.activePlans, ...local.studentData.activePlans],
    },
    learningProfile: {
      knowledgePoints: unique([...remote.learningProfile.knowledgePoints, ...local.learningProfile.knowledgePoints]).slice(0, 12),
      weakPoints: unique([...remote.learningProfile.weakPoints, ...local.learningProfile.weakPoints]).slice(0, 8),
      recentTopics: unique([...remote.learningProfile.recentTopics, ...local.learningProfile.recentTopics]).slice(0, 8),
      strongestSubject: local.learningProfile.strongestSubject !== "通用" ? local.learningProfile.strongestSubject : remote.learningProfile.strongestSubject,
      activityScore: Math.max(remote.learningProfile.activityScore, local.learningProfile.activityScore),
    },
  };
}

function buildRemoteLearningProfile(
  subjectStats: Record<string, number>,
  errorTypeStats: Record<string, number>,
  studentData: DashboardResponseData["studentData"]
) {
  const strongestSubject = Object.entries(subjectStats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "通用";
  return {
    knowledgePoints: Object.keys(subjectStats),
    weakPoints: Object.keys(errorTypeStats),
    recentTopics: studentData.activePlans.map((plan) => plan.plan_title),
    strongestSubject,
    activityScore: Math.min(100, Object.values(subjectStats).reduce((sum, value) => sum + value, 0) * 8),
  };
}

function mergeCounts(a: Record<string, number>, b: Record<string, number>) {
  const merged = { ...a };
  for (const [key, value] of Object.entries(b)) merged[key] = (merged[key] ?? 0) + value;
  return merged;
}

function mergeDaily(
  a: Record<string, { classroom: number; error: number; review: number; resource: number }>,
  b: Record<string, { classroom: number; error: number; review: number; resource: number }>
) {
  const merged = { ...buildEmptyDailyStats(), ...a };
  for (const [date, stats] of Object.entries(b)) {
    const current = merged[date] ?? { classroom: 0, error: 0, review: 0, resource: 0 };
    merged[date] = {
      classroom: current.classroom + stats.classroom,
      error: current.error + stats.error,
      review: current.review + stats.review,
      resource: current.resource + stats.resource,
    };
  }
  return merged;
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

function addDaily(
  dailyStats: Record<string, { classroom: number; error: number; review: number; resource: number }>,
  createdAt: string,
  type: "classroom" | "error" | "review" | "resource"
) {
  const date = toDateKey(createdAt);
  if (!dailyStats[date]) return;
  dailyStats[date][type]++;
}

function toDateKey(value: string) {
  const date = new Date(value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return value.split(" ")[0] || value;
  return date.toISOString().split("T")[0];
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => typeof item === "string" ? item : JSON.stringify(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function parsePriorityTopics(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => typeof item === "object" && item !== null && "topic" in item ? String(item.topic) : "")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readMemoryField(content: string, field: string): string {
  const pattern = new RegExp(`^${field}：(.+)$`, "m");
  return content.match(pattern)?.[1]?.trim() ?? "";
}

function extractKnowledgePoints(content: string, tags: string): string[] {
  const points = parseStringArray(tags).filter((tag) => tag.startsWith("kp:")).map((tag) => tag.slice(3));
  const inlinePoints = content.match(/[\u4e00-\u9fa5A-Za-z0-9·+\-]{2,24}(?:定律|公式|概念|原理|规则|方法|模型|实验|单位|性质|知识点)/g) ?? [];
  const header = content.match(/\[课堂知识点\]\s*([^\n]+)/)?.[1]?.split(/[、,，]/) ?? [];
  return unique([...points, ...inlinePoints, ...header]);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function compact(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}
