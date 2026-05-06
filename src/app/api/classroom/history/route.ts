import { NextRequest, NextResponse } from "next/server";
import { classroomHistoryStore } from "@/lib/classroom-history";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(Number(limitParam) || 80, 200) : 80;

    return NextResponse.json({
      success: true,
      data: classroomHistoryStore.list({ subject, limit }),
      storage: "local",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
