/**
 * SSE stream of live agent events (task start/done/error, status changes)
 * GET /api/agent/events
 *
 * Client usage:
 *   const es = new EventSource("/api/agent/events");
 *   es.onmessage = (e) => console.log(JSON.parse(e.data));
 */
import { agentEvents } from "@/lib/agent-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial ping
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));

      const unsub = agentEvents.subscribe((event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnected
          unsub();
        }
      });

      // Keep-alive ping every 20s
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
          unsub();
        }
      }, 20_000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
