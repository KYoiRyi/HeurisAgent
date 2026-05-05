import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取智能体任务列表（协同监控）
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const sourceAgent = searchParams.get("source_agent");
    const targetAgent = searchParams.get("target_agent");
    const status = searchParams.get("status");
    const taskType = searchParams.get("task_type");

    let query = client
      .from("agent_tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (sourceAgent) query = query.eq("source_agent", sourceAgent);
    if (targetAgent) query = query.eq("target_agent", targetAgent);
    if (status) query = query.eq("status", status);
    if (taskType) query = query.eq("task_type", taskType);

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 创建智能体协同任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskType, sourceAgent, targetAgent, priority, inputData, relatedRecordIds } = body;

    if (!taskType || !sourceAgent) {
      return NextResponse.json({ error: "任务类型和来源智能体不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("agent_tasks")
      .insert({
        task_type: taskType,
        source_agent: sourceAgent,
        target_agent: targetAgent || null,
        priority: priority || "normal",
        input_data: inputData || {},
        related_record_ids: relatedRecordIds || [],
        status: "pending",
      })
      .select();

    if (error) throw new Error(`创建任务失败: ${error.message}`);

    return NextResponse.json({ success: true, data: data?.[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 更新任务状态
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, outputData, errorMessage } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "任务ID和状态不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const updateData: Record<string, unknown> = { status };
    if (status === "running") updateData.started_at = new Date().toISOString();
    if (status === "completed") updateData.completed_at = new Date().toISOString();
    if (outputData) updateData.output_data = outputData;
    if (errorMessage) updateData.error_message = errorMessage;

    const { data, error } = await client
      .from("agent_tasks")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) throw new Error(`更新任务失败: ${error.message}`);

    return NextResponse.json({ success: true, data: data?.[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
