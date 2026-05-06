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
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const limit = parseInt(searchParams.get("limit") || "50");
  const source = searchParams.get("source") || undefined;

  const memories = q
    ? memoryStore.search(q, limit)
    : memoryStore.list({ limit, source });

  return NextResponse.json({
    success: true,
    data: memories,
    total: memoryStore.count(),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { content, source, tags, importance, pinned, session_id } = body;

  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });

  const memory = memoryStore.add(content, { source, tags, importance, pinned, session_id });
  return NextResponse.json({ success: true, data: memory });
}

export async function PATCH(request: NextRequest) {
  const { id, ...patch } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const memory = memoryStore.update(id, patch);
  if (!memory) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: memory });
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ok = memoryStore.delete(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
