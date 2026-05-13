import { NextRequest, NextResponse } from "next/server";
import { llmInvoke } from "@/lib/llm-client";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { reviewPlanStore } from "@/lib/review-plans";
import { memoryStore } from "@/lib/memory";

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
    const planStudentName =
      typeof studentName === "string" && studentName.trim() ? studentName.trim() : "默认学习者";
    const planSubject = typeof subject === "string" && subject.trim() ? subject.trim() : "";

    if (!planSubject) {
      return NextResponse.json(
        { error: "学科不能为空" },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 检查是否有活跃的复习计划（仅当 DB 可用时）
    if (client && !forceRegenerate) {
      let query = client
        .from("review_plans")
        .select("*")
        .eq("subject", planSubject)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);

      if (studentName) query = query.eq("student_name", planStudentName);

      const { data: existingPlan } = await query;

      if (existingPlan?.[0]) {
        return NextResponse.json({ success: true, data: existingPlan[0], cached: true });
      }
    }

    // 收集学生学习数据（如果 DB 可用）
    let errorSummary = "暂无错题记录";
    let classSummary = "暂无课堂参与记录";
    let reviewSummary = "暂无复习记录";
    let resourceSummary = "暂无推荐教学资源";

    if (client) {
      const [
        { data: errorData },
        { data: classRecords },
        { data: reviewRecords },
        { data: resources },
      ] = await Promise.all([
        client
          .from("error_questions")
          .select("error_type, knowledge_points, subject, status, mastered, created_at")
          .eq("subject", planSubject)
          .order("created_at", { ascending: false })
          .limit(20),
        client
          .from("learning_records")
          .select("record_type, description, knowledge_point, score, created_at")
          .eq("subject", planSubject)
          .eq("record_type", "classroom")
          .order("created_at", { ascending: false })
          .limit(10),
        client
          .from("learning_records")
          .select("record_type, description, created_at")
          .eq("subject", planSubject)
          .eq("record_type", "review")
          .order("created_at", { ascending: false })
          .limit(10),
        client
          .from("learning_resources")
          .select("title, subject, tags")
          .eq("subject", planSubject)
          .eq("is_shared", true)
          .limit(5),
      ]);

      if (errorData && errorData.length > 0) {
        errorSummary = `错题记录(${errorData.length}条)：${errorData
          .map(
            (e: { error_type: string | null; knowledge_points: unknown; mastered: boolean }) =>
              `${e.error_type || "未分类"}类型${e.mastered ? "(已掌握)" : "(未掌握)"}，涉及知识点：${Array.isArray(e.knowledge_points) ? e.knowledge_points.join("、") : "未知"}`
          )
          .join("；")}`;
      }
      if (classRecords && classRecords.length > 0) {
        classSummary = `课堂参与记录(${classRecords.length}条)：${classRecords
          .map(
            (r: { description: string | null; knowledge_point: string | null }) =>
              r.description || r.knowledge_point || "课堂学习"
          )
          .join("；")}`;
      }
      if (reviewRecords && reviewRecords.length > 0) {
        reviewSummary = `复习记录(${reviewRecords.length}条)`;
      }
      if (resources && resources.length > 0) {
        resourceSummary = `可用教学资源：${resources.map((r: { title: string }) => r.title).join("、")}`;
      }
    }

    if (!client) {
      const errorMemories = memoryStore.search(`${planSubject} 错题 误区 薄弱点 error-question weakness`, 12, planSubject);
      if (errorMemories.length > 0) {
        errorSummary = `本地错题/薄弱点记忆(${errorMemories.length}条)：${errorMemories
          .map((memory) => memory.content.replace(/\s+/g, " ").slice(0, 180))
          .join("；")}`;
      }
      const knowledgeMemories = memoryStore.search(`${planSubject} 知识点 knowledge-point`, 12, planSubject);
      if (knowledgeMemories.length > 0) {
        classSummary = `本地知识点记录(${knowledgeMemories.length}条)：${knowledgeMemories
          .map((memory) => memory.content.replace(/\s+/g, " ").slice(0, 160))
          .join("；")}`;
      }
    }

    const analysisPrompt = `学科：${planSubject}

学习数据分析：
1. ${errorSummary}
2. ${classSummary}
3. ${reviewSummary}
4. ${resourceSummary}

请基于以上学习数据，生成个性化复习计划，重点标注知识盲点和优先复习内容。`;

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: REVIEW_AGENT_SYSTEM_PROMPT },
      { role: "user", content: analysisPrompt },
    ];

    const response = await llmInvoke(messages, { temperature: 0.5 });

    // 解析复习计划
    let planData: Record<string, unknown> = {};
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        planData = JSON.parse(jsonMatch[0]);
      }
    } catch {
      planData = {
        plan_title: `${planSubject}复习计划`,
        blind_spots: [],
        priority_topics: [],
        schedule: [],
        review_strategy: response.content,
        plan_content: response.content,
      };
    }

    const totalTasks = Array.isArray(planData.schedule)
      ? (planData.schedule as Array<{ tasks?: unknown[] }>).reduce(
          (sum: number, s: { tasks?: unknown[] }) =>
            sum + (Array.isArray(s.tasks) ? s.tasks.length : 0),
          0
        )
      : 0;

    // 保存到 DB（如果可用）
    let savedPlan: unknown = planData;
    if (client) {
      let updateQuery = client
        .from("review_plans")
        .update({ status: "completed" })
        .eq("subject", planSubject)
        .eq("status", "active");

      if (studentName) updateQuery = updateQuery.eq("student_name", planStudentName);
      await updateQuery;

      const { data, error } = await client
        .from("review_plans")
        .insert({
          student_name: planStudentName,
          subject: planSubject,
          plan_title: (planData.plan_title as string) || `${planSubject}复习计划`,
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
      if (data?.[0]) savedPlan = data[0];

      // 异步后台任务
      void (async () => {
        try {
          await client.from("learning_records").insert({
            student_name: planStudentName,
            subject: planSubject,
            record_type: "review",
            agent_type: "review_agent",
            description: `生成${planSubject}个性化复习计划`,
            details: {
              plan_id: (savedPlan as { id?: string }).id,
              blind_spots_count: Array.isArray(planData.blind_spots)
                ? planData.blind_spots.length
                : 0,
            },
          });

          if (Array.isArray(planData.blind_spots) && planData.blind_spots.length > 0) {
            await client.from("agent_tasks").insert({
              task_type: "coordinate",
              source_agent: "review_agent",
              target_agent: "classroom_agent",
              status: "pending",
              priority: "normal",
              input_data: {
                student_name: planStudentName,
                subject: planSubject,
                blind_spots: planData.blind_spots,
                message: "复习策略智能体发现学生知识盲点，请在后续课堂互动中重点关注",
              },
            });
          }
        } catch (err) {
          console.error("[review] Background DB writes failed:", err);
        }
      })();
    } else {
      savedPlan = reviewPlanStore.saveActive({
        studentName: planStudentName,
        subject: planSubject,
        planData,
        totalTasks,
      });

      if (Array.isArray(planData.blind_spots) && planData.blind_spots.length > 0) {
        try {
          planData.blind_spots.forEach((spot) => {
            memoryStore.add(`[复习智能体发现盲点] ${planSubject}：${spot}`, {
              source: "review",
              tags: ["blind-spot", "weakness", planSubject],
              importance: 2,
              pinned: true
            });
          });
        } catch (err) {
          console.error("[review] Local memory saving failed:", err);
        }
      }
    }

    return NextResponse.json({ success: true, data: savedPlan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    console.error("[/api/review POST]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 更新复习进度
export async function PATCH(request: NextRequest) {
  try {
    const { id, completed_tasks, schedule } = await request.json();
    if (!id) return NextResponse.json({ error: "缺少计划ID" }, { status: 400 });

    const client = getSupabaseClient();
    if (!client) {
      const updated = reviewPlanStore.update(Number(id.replace("local-", "")), {
        completed_tasks,
        schedule: JSON.stringify(schedule)
      });
      return NextResponse.json({ success: true, data: updated });
    }

    const { data, error } = await client
      .from("review_plans")
      .update({
        completed_tasks,
        schedule,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select();

    if (error) throw error;
    return NextResponse.json({ success: true, data: data?.[0] });

  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 获取复习计划列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentName = searchParams.get("student_name");
    const subject = searchParams.get("subject");
    const status = searchParams.get("status");

    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json({
        success: true,
        data: reviewPlanStore.list({ subject, status }),
        storage: "local",
      });
    }

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
