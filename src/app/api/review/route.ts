import { NextRequest, NextResponse } from "next/server";
import { LLMClient, Config, HeaderUtils } from "coze-coding-dev-sdk";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const REVIEW_AGENT_SYSTEM_PROMPT = `你是一个专业的复习策略智能体，擅长根据学生学习记录生成个性化复习计划和知识盲点提示。

你的核心能力：
1. **学习数据分析**：分析学生的错题记录、课堂参与度、复习完成度等学习数据
2. **知识盲点识别**：从学习数据中识别学生的知识薄弱环节和盲区
3. **个性化复习计划**：根据艾宾浩斯遗忘曲线和知识掌握程度生成复习计划
4. **优先级排序**：将最需要复习的知识点排在前面，合理分配复习时间

输出格式要求（请用JSON格式输出）：
{
  "plan_title": "复习计划标题",
  "blind_spots": ["盲点1", "盲点2"],
  "priority_topics": [
    {"topic": "知识点", "priority": "高/中/低", "reason": "原因"}
  ],
  "schedule": [
    {"day": "第N天", "tasks": ["任务1", "任务2"], "duration_minutes": 30}
  ],
  "review_strategy": "复习策略建议",
  "plan_content": "完整复习计划的文本描述"
}`;

export async function POST(request: NextRequest) {
  try {
    const { studentName, subject, forceRegenerate } = await request.json();

    if (!studentName || !subject) {
      return NextResponse.json({ error: "学生姓名和学科不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 检查是否有活跃的复习计划
    if (!forceRegenerate) {
      const { data: existingPlan } = await client
        .from("review_plans")
        .select("*")
        .eq("student_name", studentName)
        .eq("subject", subject)
        .eq("status", "active")
        .maybeSingle();

      if (existingPlan) {
        return NextResponse.json({ success: true, data: existingPlan, cached: true });
      }
    }

    // 收集学生学习数据
    const { data: errorData } = await client
      .from("error_questions")
      .select("error_type, knowledge_points, subject, status, mastered, created_at")
      .eq("student_name", studentName)
      .eq("subject", subject)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: classRecords } = await client
      .from("learning_records")
      .select("record_type, description, knowledge_point, score, created_at")
      .eq("student_name", studentName)
      .eq("subject", subject)
      .eq("record_type", "classroom")
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: reviewRecords } = await client
      .from("learning_records")
      .select("record_type, description, created_at")
      .eq("student_name", studentName)
      .eq("subject", subject)
      .eq("record_type", "review")
      .order("created_at", { ascending: false })
      .limit(10);

    // 构建分析上下文
    const errorSummary = errorData && errorData.length > 0
      ? `错题记录(${errorData.length}条)：${errorData.map((e: { error_type: string | null; knowledge_points: unknown; mastered: boolean }) =>
          `${e.error_type || "未分类"}类型${e.mastered ? "(已掌握)" : "(未掌握)"}，涉及知识点：${Array.isArray(e.knowledge_points) ? e.knowledge_points.join("、") : "未知"}`
        ).join("；")}`
      : "暂无错题记录";

    const classSummary = classRecords && classRecords.length > 0
      ? `课堂参与记录(${classRecords.length}条)：${classRecords.map((r: { description: string | null; knowledge_point: string | null }) =>
          r.description || r.knowledge_point || "课堂学习"
        ).join("；")}`
      : "暂无课堂参与记录";

    const reviewSummary = reviewRecords && reviewRecords.length > 0
      ? `复习记录(${reviewRecords.length}条)`
      : "暂无复习记录";

    // 获取相关教学资源
    const { data: resources } = await client
      .from("learning_resources")
      .select("title, subject, tags")
      .eq("subject", subject)
      .eq("is_shared", true)
      .limit(5);

    const resourceSummary = resources && resources.length > 0
      ? `可用教学资源：${resources.map((r: { title: string }) => r.title).join("、")}`
      : "暂无推荐教学资源";

    const analysisPrompt = `学生：${studentName}，学科：${subject}

学习数据分析：
1. ${errorSummary}
2. ${classSummary}
3. ${reviewSummary}
4. ${resourceSummary}

请基于以上学习数据，生成个性化复习计划，重点标注知识盲点和优先复习内容。`;

    const config = new Config();
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const llmClient = new LLMClient(config, customHeaders);

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: REVIEW_AGENT_SYSTEM_PROMPT },
      { role: "user", content: analysisPrompt },
    ];

    const response = await llmClient.invoke(messages, {
      model: "doubao-seed-1-8-251228",
      temperature: 0.5,
      thinking: "enabled",
    });

    // 解析复习计划
    let planData: Record<string, unknown> = {};
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        planData = JSON.parse(jsonMatch[0]);
      }
    } catch {
      planData = {
        plan_title: `${subject}复习计划`,
        blind_spots: [],
        priority_topics: [],
        schedule: [],
        review_strategy: response.content,
        plan_content: response.content,
      };
    }

    // 计算总任务数
    const totalTasks = Array.isArray(planData.schedule)
      ? (planData.schedule as Array<{ tasks?: unknown[] }>).reduce(
          (sum: number, s: { tasks?: unknown[] }) => sum + (Array.isArray(s.tasks) ? s.tasks.length : 0), 0
        )
      : 0;

    // 使旧的活跃计划失效
    await client
      .from("review_plans")
      .update({ status: "completed" })
      .eq("student_name", studentName)
      .eq("subject", subject)
      .eq("status", "active");

    // 创建新复习计划
    const { data, error } = await client
      .from("review_plans")
      .insert({
        student_name: studentName,
        subject,
        plan_title: (planData.plan_title as string) || `${subject}复习计划`,
        plan_content: (planData.plan_content as string) || "",
        blind_spots: planData.blind_spots || [],
        schedule: planData.schedule || [],
        priority_topics: planData.priority_topics || [],
        review_strategy: (planData.review_strategy as string) || "",
        total_tasks: totalTasks,
        status: "active",
      })
      .select();

    if (error) throw new Error(`创建复习计划失败: ${error.message}`);

    // 记录学习行为
    await client.from("learning_records").insert({
      student_name: studentName,
      subject,
      record_type: "review",
      agent_type: "review_agent",
      description: `生成${subject}个性化复习计划`,
      details: { plan_id: data?.[0]?.id, blind_spots_count: Array.isArray(planData.blind_spots) ? planData.blind_spots.length : 0 },
    });

    // 创建协同任务：通知课堂智能体关注知识盲点
    if (Array.isArray(planData.blind_spots) && planData.blind_spots.length > 0) {
      await client.from("agent_tasks").insert({
        task_type: "coordinate",
        source_agent: "review_agent",
        target_agent: "classroom_agent",
        status: "pending",
        priority: "normal",
        input_data: {
          student_name: studentName,
          subject,
          blind_spots: planData.blind_spots,
          message: "复习策略智能体发现学生知识盲点，请在后续课堂互动中重点关注",
        },
      });
    }

    return NextResponse.json({ success: true, data: data?.[0] || planData });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 获取复习计划列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const studentName = searchParams.get("student_name");
    const subject = searchParams.get("subject");
    const status = searchParams.get("status");

    let query = client
      .from("review_plans")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (studentName) query = query.eq("student_name", studentName);
    if (subject) query = query.eq("subject", subject);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
