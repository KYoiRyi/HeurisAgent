import { NextRequest, NextResponse } from "next/server";
import { llmInvoke } from "@/lib/llm-client";

const MUTATION_SYSTEM_PROMPT = `你是一个教育专家。你的任务是根据学生提供的“错题”及其“知识点”，生成一道全新的【单项选择题】，用于检验学生是否真的掌握了该知识点。

这道题目叫做“变式题”（Mutation Question）。它必须：
1. 考察的核心知识点与原错题一致，但场景、数据或问法要有变化。
2. 难度应与原错题相当或稍微简单一点，以鼓励为主。
3. 必须提供4个选项（A、B、C、D）。
4. 必须明确指出正确答案。
5. 必须提供简单的解析。

请严格按照以下 JSON 格式输出你的结果（必须是可以直接被 JSON.parse 解析的格式，不要有多余的 Markdown 标记）：
{
  "question": "变式题的具体题干内容",
  "options": {
    "A": "选项A的内容",
    "B": "选项B的内容",
    "C": "选项C的内容",
    "D": "选项D的内容"
  },
  "correctAnswer": "A", // 只能是 A/B/C/D 中的一个
  "explanation": "为什么选这个答案的解析"
}`;

export async function POST(request: NextRequest) {
  try {
    const { errorQuestion } = await request.json();

    if (!errorQuestion) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const prompt = `原错题：${errorQuestion.question_text}
涉及的知识点：${Array.isArray(errorQuestion.knowledge_points) ? errorQuestion.knowledge_points.join("、") : (errorQuestion.knowledge_points || "未知")}
错因分析：${errorQuestion.error_analysis || "未知"}

请为这道错题生成一道变式选择题。`;

    const messages = [
      { role: "system" as const, content: MUTATION_SYSTEM_PROMPT },
      { role: "user" as const, content: prompt },
    ];

    const response = await llmInvoke(messages, { temperature: 0.8 });
    
    // Parse the JSON output
    let mutationData = null;
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        mutationData = JSON.parse(jsonMatch[0]);
      } else {
        mutationData = JSON.parse(response.content);
      }
    } catch (e) {
      console.error("Failed to parse mutation JSON:", e, response.content);
      return NextResponse.json({ error: "生成的格式有误，请重试" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: mutationData });
  } catch (error) {
    console.error("[/api/errors/mutation POST]", error);
    const message = error instanceof Error ? error.message : "服务器内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
