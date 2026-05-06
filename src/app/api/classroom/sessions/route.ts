import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取课堂会话列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json({ success: true, data: [] });
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = client
      .from("classroom_sessions")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw new Error(`获取课堂会话失败: ${error.message}`);

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 创建课堂会话
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, subject, teacher, topicSummary, keyPoints, resourceIds } = body;

    if (!title || !subject) {
      return NextResponse.json({ error: "课堂标题和学科不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json({ error: "数据库未配置" }, { status: 503 });
    }

    const { data, error } = await client
      .from("classroom_sessions")
      .insert({
        title,
        subject,
        teacher: teacher || "教师",
        status: "active",
        topic_summary: topicSummary || null,
        key_points: keyPoints || [],
        resource_ids: resourceIds || [],
        participant_count: 1,
      })
      .select();

    if (error) throw new Error(`创建课堂会话失败: ${error.message}`);

    return NextResponse.json({ success: true, data: data?.[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
