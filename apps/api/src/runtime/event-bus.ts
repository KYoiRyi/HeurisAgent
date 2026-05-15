/**
 * Process-wide event bus for streaming agent events to SSE clients and
 * any future in-process listeners. The runtime publishes lifecycle and
 * tool events here; SSE controllers subscribe and forward to the wire.
 */
import { Injectable } from "@nestjs/common";
import { Subject, type Observable } from "rxjs";

export interface AgentEvent {
  type:
    | "task_start"
    | "task_done"
    | "task_error"
    | "status"
    | "tool_start"
    | "tool_end"
    | "stream_chunk";
  payload: Record<string, unknown>;
  ts: string;
}

@Injectable()
export class AgentEventBus {
  private readonly subject = new Subject<AgentEvent>();

  emit(event: AgentEvent): void {
    this.subject.next(event);
  }

  asObservable(): Observable<AgentEvent> {
    return this.subject.asObservable();
  }
}
