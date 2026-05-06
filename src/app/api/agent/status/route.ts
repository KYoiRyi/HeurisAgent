/**
 * GET  /api/agent/status    → daemon state + stats
 * POST /api/agent/status    → { action: "start"|"stop" }
 */
import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "@/lib/agent-runtime";

export async function GET() {
  return NextResponse.json({ success: true, data: agentRuntime.status() });
}

export async function POST(request: NextRequest) {
  const { action } = await request.json();
  if (action === "start") {
    agentRuntime.start();
  } else if (action === "stop") {
    agentRuntime.stop();
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: agentRuntime.status() });
}
