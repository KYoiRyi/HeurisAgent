import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { resourceStore } from "@/lib/resources";

// 创建教学资源
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, subject, category, content, fileUrl, tags, difficulty, createdBy } = body;

    if (!title || !subject || !category) {
      return NextResponse.json({ error: "标题、学科和类别不能为空" }, { status: 400 });
    }

    const client = getSupabaseClient();
    if (!client) {
      const data = resourceStore.add({
        title,
        subject,
        category,
        content: content || null,
        file_url: fileUrl || null,
        tags: normalizeTags(tags),
        difficulty: difficulty || "medium",
        created_by: createdBy || "system",
      });

      return NextResponse.json({ success: true, data, storage: "local" });
    }

    const { data, error } = await client
      .from("learning_resources")
      .insert({
        title,
        subject,
        category,
        content: content || null,
        file_url: fileUrl || null,
        tags: normalizeTags(tags),
        difficulty: difficulty || "medium",
        created_by: createdBy || "system",
        is_shared: true,
      })
      .select();

    if (error) {
      const localData = resourceStore.add({
        title,
        subject,
        category,
        content: content || null,
        file_url: fileUrl || null,
        tags: normalizeTags(tags),
        difficulty: difficulty || "medium",
        created_by: createdBy || "system",
      });

      return NextResponse.json({
        success: true,
        data: localData,
        storage: "local",
        warning: `Supabase 写入失败，已保存到本地资源库：${error.message}`,
      });
    }

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

    const localResources = resourceStore.list({ subject, category, difficulty, limit: 50 });

    if (!client) {
      return NextResponse.json({ success: true, data: localResources, storage: "local" });
    }

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
    if (error) {
      return NextResponse.json({
        success: true,
        data: localResources,
        storage: "local",
        warning: `Supabase 查询失败，已显示本地资源库：${error.message}`,
      });
    }

    return NextResponse.json({ success: true, data: [...(data || []), ...localResources] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
}
