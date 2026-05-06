/**
 * Memory CRUD API
 * GET    /api/memory?q=&limit=&source=    → search / list
 * POST   /api/memory                      → add memory
 * PATCH  /api/memory                      → update { id, ... }
 * DELETE /api/memory                      → delete { id }
 */
import { NextRequest, NextResponse } from "next/server";
import { memoryStore } from "@/lib/memory";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const limit = normalizeLimit(searchParams.get("limit"), 50);
    const source = searchParams.get("source") || undefined;

    const memories = q
      ? memoryStore.search(q, limit)
      : memoryStore.list({ limit, source });

    return NextResponse.json({
      success: true,
      data: memories,
      total: memoryStore.count(),
    });
  } catch (error) {
    return jsonError(error, "记忆读取失败");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, source, tags, importance, pinned, session_id } = body;

    if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });

    const memory = memoryStore.add(content, { source, tags, importance, pinned, session_id });
    return NextResponse.json({ success: true, data: memory });
  } catch (error) {
    return jsonError(error, "记忆保存失败");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, ...patch } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const memory = memoryStore.update(id, patch);
    if (!memory) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: memory });
  } catch (error) {
    return jsonError(error, "记忆更新失败");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const ok = memoryStore.delete(id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, "记忆删除失败");
  }
}

function normalizeLimit(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 200);
}

function jsonError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}
