import { NextRequest, NextResponse } from "next/server";
import { llmInvokeStream } from "@/lib/llm-client";

const DIAGNOSE_SYSTEM_PROMPT = `你是一个错题诊断导师，你将与学生进行一对一的错题分析对话。
你的目标是像苏格拉底一样，通过**不断追问和引导**，让学生自己发现做错题目的原因，而不是直接给出答案和解析。

规则：
1. 你的语气应该是耐心、鼓励的，像是经验丰富的辅导老师。
2. 绝对不要直接告诉学生正确答案，也不要一次性给出完整的解析。
3. 一次只问一个问题。例如：“你能告诉我你当时选这个答案的思路吗？”或“你注意到题目中提到的某个条件了吗？”
4. 如果学生回答错误，不要直接批评，而是指出矛盾点让他自己思考。
5. 当你认为学生已经领悟错误原因时，你可以说：“太好了，看来你已经明白问题出在哪了！”，并在最后加上特殊的标记：[DIAGNOSIS_COMPLETE]，然后总结一下核心错因。`;

export async function POST(request: NextRequest) {
  try {
    const { messages, errorQuestion } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }

    // Build the context prompt
    const contextPrompt = `当前错题信息：
学科：${errorQuestion.subject || '未知'}
题目：${errorQuestion.question_text || '未知'}
学生的错误答案：${errorQuestion.student_answer || '未提供'}
（注：如果你知道正确答案，也不要直接告诉他，请通过提问引导）`;

    const systemMessage = {
      role: "system" as const,
      content: `${DIAGNOSE_SYSTEM_PROMPT}\n\n${contextPrompt}`
    };

    const apiMessages = [systemMessage, ...messages];

    // 获取流式响应
    const stream = await llmInvokeStream(apiMessages, { temperature: 0.7 });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[/api/errors/diagnose POST]", error);
    const message = error instanceof Error ? error.message : "服务器内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
