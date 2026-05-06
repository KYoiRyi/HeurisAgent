import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

/** Empty stats returned when no database is configured */
const EMPTY_RESPONSE = {
  success: true,
  _offline: true,
  data: {
    overview: {
      totalResources: 0,
      totalErrors: 0,
      activePlans: 0,
      activeSessions: 0,
    },
    errorTypeStats: {} as Record<string, number>,
    subjectStats: {} as Record<string, number>,
    taskStats: { pending: 0, running: 0, completed: 0, failed: 0 },
    agentActivity: {} as Record<string, number>,
    studentData: null,
    dailyStats: {} as Record<string, { classroom: number; error: number; review: number; resource: number }>,
  },
};

export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();

    // No Supabase configured — return empty data so the UI doesn't crash
    if (!client) {
      return NextResponse.json(EMPTY_RESPONSE);
    }

    const { searchParams } = new URL(request.url);
    const studentName = searchParams.get("student_name");

    // 1. 总体统计
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

    // 2. 错题分类统计
    const { data: errorTypeData } = await client
      .from("error_questions")
      .select("error_type");

    const errorTypeStats: Record<string, number> = {};
    for (const item of errorTypeData ?? []) {
      const type = item.error_type || "未分类";
      errorTypeStats[type] = (errorTypeStats[type] || 0) + 1;
    }

    // 3. 学科分布
    const { data: subjectData } = await client
      .from("learning_records")
      .select("subject");

    const subjectStats: Record<string, number> = {};
    for (const item of subjectData ?? []) {
      if (item.subject) {
        subjectStats[item.subject] = (subjectStats[item.subject] || 0) + 1;
      }
    }

    // 4. 智能体任务统计
    const { data: taskData } = await client
      .from("agent_tasks")
      .select("status, source_agent");

    const taskStats = { pending: 0, running: 0, completed: 0, failed: 0 };
    const agentActivity: Record<string, number> = {};

    for (const task of taskData ?? []) {
      if (task.status && task.status in taskStats) {
        taskStats[task.status as keyof typeof taskStats]++;
      }
      if (task.source_agent) {
        agentActivity[task.source_agent] = (agentActivity[task.source_agent] || 0) + 1;
      }
    }

    // 5. 学生个人数据（如果指定了学生姓名）
    let studentData = null;
    if (studentName) {
      const [
        { count: studentErrors },
        { count: studentMastered },
        { data: studentRecords },
        { data: studentPlans },
      ] = await Promise.all([
        client
          .from("error_questions")
          .select("*", { count: "exact", head: true })
          .eq("student_name", studentName),
        client
          .from("error_questions")
          .select("*", { count: "exact", head: true })
          .eq("student_name", studentName)
          .eq("mastered", true),
        client
          .from("learning_records")
          .select("record_type, created_at")
          .eq("student_name", studentName)
          .order("created_at", { ascending: false })
          .limit(30),
        client
          .from("review_plans")
          .select("plan_title, subject, status, progress, total_tasks, completed_tasks")
          .eq("student_name", studentName)
          .eq("status", "active"),
      ]);

      studentData = {
        totalErrors: studentErrors || 0,
        masteredErrors: studentMastered || 0,
        masteryRate:
          studentErrors
            ? Math.round(((studentMastered || 0) / studentErrors) * 100)
            : 0,
        recentRecords: studentRecords || [],
        activePlans: studentPlans || [],
      };
    }

    // 6. 近7天学习趋势
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: recentRecords } = await client
      .from("learning_records")
      .select("record_type, created_at")
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: true });

    const dailyStats: Record<
      string,
      { classroom: number; error: number; review: number; resource: number }
    > = {};
    for (const record of recentRecords ?? []) {
      if (record.created_at) {
        const date = new Date(record.created_at).toISOString().split("T")[0];
        if (!dailyStats[date]) {
          dailyStats[date] = { classroom: 0, error: 0, review: 0, resource: 0 };
        }
        const type = record.record_type as keyof (typeof dailyStats)[string];
        if (type in dailyStats[date]) {
          dailyStats[date][type]++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
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
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    console.error("[/api/dashboard]", error);
    // Return empty data instead of 500 so the UI stays functional
    return NextResponse.json({
      ...EMPTY_RESPONSE,
      _error: message,
    });
  }
}
