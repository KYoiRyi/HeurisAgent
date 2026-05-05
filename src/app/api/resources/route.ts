import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 创建教学资源
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, subject, category, content, fileUrl, tags, difficulty, createdBy } = body;

    if (!title || !subject || !category) {
      return NextResponse.json({ error: "标题、学科和类别不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data, error } = await client
      .from("learning_resources")
      .insert({
        title,
        subject,
        category,
        content: content || null,
        file_url: fileUrl || null,
        tags: tags || [],
        difficulty: difficulty || "medium",
        created_by: createdBy || "system",
        is_shared: true,
      })
      .select();

    if (error) throw new Error(`创建资源失败: ${error.message}`);

    // 记录学习行为
    await client.from("learning_records").insert({
      student_name: createdBy || "system",
      subject,
      record_type: "resource",
      agent_type: "classroom_agent",
      description: `导入教学资源：${title}`,
      details: { resource_id: data?.[0]?.id, category },
    });

    return NextResponse.json({ success: true, data: data?.[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 获取教学资源列表
export async function GET(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject");
    const category = searchParams.get("category");
    const difficulty = searchParams.get("difficulty");

    let query = client
      .from("learning_resources")
      .select("*")
      .eq("is_shared", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (subject) query = query.eq("subject", subject);
    if (category) query = query.eq("category", category);
    if (difficulty) query = query.eq("difficulty", difficulty);

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
