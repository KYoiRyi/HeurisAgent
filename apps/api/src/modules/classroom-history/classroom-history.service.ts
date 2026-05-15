import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DB } from "@/persistence/persistence.module";
import type { Database } from "@/persistence/database";
import { classroomHistory, type ClassroomHistoryRow } from "@/persistence/schema";

export interface ClassroomHistoryMessage {
  id: string;
  session_id: string | null;
  subject: string;
  role: "student" | "agent";
  content: string;
  message_type: string;
  related_knowledge_points: string[];
  live_component: Record<string, string> | null;
  tool_calls: Record<string, unknown>[];
  created_at: string;
}

export interface AddClassroomHistoryInput {
  sessionId?: string;
  subject: string;
  role: "student" | "agent";
  content: string;
  messageType?: string;
  knowledgePoints?: string[];
  liveComponent?: Record<string, string> | null;
  toolCalls?: Record<string, unknown>[];
}

@Injectable()
export class ClassroomHistoryService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async add(input: AddClassroomHistoryInput): Promise<ClassroomHistoryMessage> {
    const [row] = await this.db
      .insert(classroomHistory)
      .values({
        sessionId: input.sessionId ?? null,
        subject: (input.subject ?? "通用").trim() || "通用",
        role: input.role,
        content: input.content.trim(),
        messageType: input.messageType ?? "message",
        relatedKnowledgePoints: input.knowledgePoints ?? [],
        liveComponent: input.liveComponent ?? null,
        toolCalls: input.toolCalls ?? [],
      })
      .returning();
    return toMessage(row);
  }

  async list(
    opts: { subject?: string | null; sessionId?: string | null; limit?: number } = {},
  ): Promise<ClassroomHistoryMessage[]> {
    const conditions = [] as ReturnType<typeof eq>[];
    if (opts.subject) conditions.push(eq(classroomHistory.subject, opts.subject));
    if (opts.sessionId) conditions.push(eq(classroomHistory.sessionId, opts.sessionId));

    const rows = await this.db
      .select()
      .from(classroomHistory)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(classroomHistory.createdAt), desc(classroomHistory.id))
      .limit(opts.limit ?? 80);

    return rows.map(toMessage).reverse();
  }

  async buildContext(subject: string, limit = 16): Promise<string> {
    const messages = await this.list({ subject, limit });
    if (messages.length === 0) return "";

    return [
      "<classroom-history>",
      "[System note: These are durable classroom transcript messages for the selected subject. Use them for continuity, but do not copy them into memory.]",
      ...messages.map((m) => {
        const role = m.role === "student" ? "学生" : "课堂智能体";
        return `${role}: ${compact(m.content, 700)}`;
      }),
      "</classroom-history>",
    ].join("\n");
  }
}

function toMessage(row: ClassroomHistoryRow): ClassroomHistoryMessage {
  return {
    id: `local-${row.id}`,
    session_id: row.sessionId ?? null,
    subject: row.subject,
    role: row.role as "student" | "agent",
    content: row.content,
    message_type: row.messageType,
    related_knowledge_points: row.relatedKnowledgePoints ?? [],
    live_component: (row.liveComponent as Record<string, string> | null) ?? null,
    tool_calls: ((row.toolCalls ?? []) as unknown[]).filter(
      (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
    ),
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

function compact(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}
