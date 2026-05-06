import { NextRequest, NextResponse } from "next/server";
import { llmInvoke } from "@/lib/llm-client";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const ERROR_AGENT_SYSTEM_PROMPT = `你是一个专业的错题管理智能体，擅长错题分析、分类和针对性强化建议生成。

你的核心能力：
1. **错题分类分析**：将错题按错误类型分类（概念错误、计算错误、审题不清、方法错误等）
2. **错因分析**：深入分析学生出错的原因，找到知识薄弱点
3. **针对性强化建议**：根据错误类型和知识薄弱点，给出个性化的强化练习建议
4. **同类题推荐**：推荐相似的练习题帮助学生巩固

输出格式要求（请用JSON格式输出）：
{
  "error_type": "概念错误/计算错误/审题不清/方法错误",
  "error_analysis": "详细的错因分析",
  "knowledge_points": ["涉及的知识点1", "知识点2"],
  "reinforcement_suggestions": "针对性强化建议",
  "similar_question_direction": "同类题推荐方向"
}`;

export async function POST(request: NextRequest) {
  try {
    const {
      questionText,
      studentAnswer,
      correctAnswer,
      subject,
      studentName,
      sessionId,
      questionId,
    } = await request.json();

    if (!questionText) {
      return NextResponse.json({ error: "题目内容不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 获取学生历史错题模式（可选）
    let historyContext = "";
    if (client && studentName && subject) {
      const { data: pastErrors } = await client
        .from("error_questions")
        .select("error_type, knowledge_points")
        .eq("student_name", studentName)
        .eq("subject", subject)
        .order("created_at", { ascending: false })
        .limit(5);

      if (pastErrors && pastErrors.length > 0) {
        const errorTypes = pastErrors
          .map((e: { error_type: string | null }) => e.error_type)
          .filter(Boolean);
        const knowledgeGaps = pastErrors
          .flatMap((e: { knowledge_points: unknown }) =>
            Array.isArray(e.knowledge_points) ? e.knowledge_points : []
          )
          .filter(Boolean);
        historyContext = `\n\n该学生近期错题模式：常见错误类型有 ${[...new Set(errorTypes)].join("、")}；知识薄弱点集中在 ${[...new Set(knowledgeGaps)].join("、")}`;
      }
    }

    const analysisPrompt = `请分析以下错题：

学科：${subject || "未知"}
题目：${questionText}
${studentAnswer ? `学生答案：${studentAnswer}` : ""}
${correctAnswer ? `正确答案：${correctAnswer}` : ""}
${historyContext}

请给出详细的错因分析、分类和强化建议。`;

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: ERROR_AGENT_SYSTEM_PROMPT },
      { role: "user", content: analysisPrompt },
    ];

    const response = await llmInvoke(messages, { temperature: 0.3 });

    // 解析 LLM 返回的分析结果
    let analysisResult: Record<string, unknown> = {};
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      }
    } catch {
      analysisResult = {
        error_type: "未分类",
        error_analysis: response.content,
        knowledge_points: [],
        reinforcement_suggestions: "",
        similar_question_direction: "",
      };
    }

    // 更新或创建错题记录（如果 DB 可用）
    let errorRecordId = questionId;
    if (client) {
      if (questionId) {
        await client
          .from("error_questions")
          .update({
            error_type: analysisResult.error_type as string,
            error_analysis: analysisResult.error_analysis as string,
            knowledge_points: analysisResult.knowledge_points,
            reinforcement_suggestions: analysisResult.reinforcement_suggestions as string,
            status: "analyzed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", questionId);
      } else {
        const { data, error } = await client
          .from("error_questions")
          .insert({
            student_name: studentName || "匿名学生",
            subject: subject || "通用",
            question_text: questionText,
            student_answer: studentAnswer,
            correct_answer: correctAnswer,
            error_type: (analysisResult.error_type as string) || "未分类",
            error_analysis: analysisResult.error_analysis as string,
            knowledge_points: analysisResult.knowledge_points || [],
            reinforcement_suggestions: analysisResult.reinforcement_suggestions as string,
            status: "analyzed",
            session_id: sessionId,
          })
          .select();

        if (error) throw new Error(`插入失败: ${error.message}`);
        if (data && data[0]) errorRecordId = data[0].id;
      }

      // 创建智能体协同任务
      await client.from("agent_tasks").insert({
        task_type: "analyze_weakness",
        source_agent: "error_agent",
        target_agent: "review_agent",
        status: "pending",
        priority: "high",
        input_data: {
          student_name: studentName,
          subject,
          error_id: errorRecordId,
          error_type: analysisResult.error_type,
          knowledge_points: analysisResult.knowledge_points,
        },
        related_record_ids: [errorRecordId],
      });

      // 记录学习行为
      await client.from("learning_records").insert({
        student_name: studentName || "匿名学生",
        subject: subject || "通用",
        record_type: "error",
        agent_type: "error_agent",
        description: `错题分析：${(questionText as string).substring(0, 80)}`,
        details: analysisResult,
      });
    }

    return NextResponse.json({
      success: true,
      data: { id: errorRecordId, ...analysisResult },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    console.error("[/api/errors POST]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 获取错题列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json({ success: true, data: [] });
    }

    const { searchParams } = new URL(request.url);
    const studentName = searchParams.get("student_name");
    const subject = searchParams.get("subject");
    const status = searchParams.get("status");
    const errorType = searchParams.get("error_type");

    let query = client
      .from("error_questions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (studentName) query = query.eq("student_name", studentName);
    if (subject) query = query.eq("subject", subject);
    if (status) query = query.eq("status", status);
    if (errorType) query = query.eq("error_type", errorType);

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
