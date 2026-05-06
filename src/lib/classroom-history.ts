import { getDb } from "./db";

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

interface AddClassroomHistoryInput {
  sessionId?: string;
  subject: string;
  role: "student" | "agent";
  content: string;
  messageType?: string;
  knowledgePoints?: string[];
  liveComponent?: Record<string, string> | null;
  toolCalls?: Record<string, unknown>[];
}

class ClassroomHistoryStore {
  add(input: AddClassroomHistoryInput): ClassroomHistoryMessage {
    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO classroom_history
          (session_id, subject, role, content, message_type, related_knowledge_points, live_component, tool_calls)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.sessionId ?? null,
        input.subject.trim() || "通用",
        input.role,
        input.content.trim(),
        input.messageType ?? "message",
        JSON.stringify(input.knowledgePoints ?? []),
        input.liveComponent ? JSON.stringify(input.liveComponent) : null,
        JSON.stringify(input.toolCalls ?? [])
      );

    return this.getById(result.lastInsertRowid as number)!;
  }

  getById(id: number): ClassroomHistoryMessage | null {
    const row = getDb()
      .prepare("SELECT * FROM classroom_history WHERE id = ?")
      .get(id) as RawClassroomHistory | undefined;
    return row ? toHistoryMessage(row) : null;
  }

  list(opts: { subject?: string | null; limit?: number } = {}): ClassroomHistoryMessage[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (opts.subject) {
      conditions.push("subject = ?");
      values.push(opts.subject);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = getDb()
      .prepare(
        `SELECT * FROM classroom_history
         ${where}
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT ?`
      )
      .all(...values, opts.limit ?? 80) as RawClassroomHistory[];

    return rows.map(toHistoryMessage).reverse();
  }

  buildContext(subject: string, limit = 16): string {
    const messages = this.list({ subject, limit });
    if (messages.length === 0) return "";

    return [
      "<classroom-history>",
      "[System note: These are durable classroom transcript messages for the selected subject. Use them for continuity, but do not copy them into memory.]",
      ...messages.map((message) => {
        const role = message.role === "student" ? "学生" : "课堂智能体";
        return `${role}: ${compact(message.content, 700)}`;
      }),
      "</classroom-history>",
    ].join("\n");
  }
}

interface RawClassroomHistory {
  id: number;
  session_id: string | null;
  subject: string;
  role: "student" | "agent";
  content: string;
  message_type: string;
  related_knowledge_points: string;
  live_component: string | null;
  tool_calls: string;
  created_at: string;
}

function toHistoryMessage(row: RawClassroomHistory): ClassroomHistoryMessage {
  return {
    id: `local-${row.id}`,
    session_id: row.session_id,
    subject: row.subject,
    role: row.role,
    content: row.content,
    message_type: row.message_type,
    related_knowledge_points: parseJsonArray(row.related_knowledge_points),
    live_component: parseLiveComponent(row.live_component),
    tool_calls: parseJsonRecords(row.tool_calls),
    created_at: row.created_at,
  };
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseLiveComponent(value: string | null): Record<string, string> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, string> : null;
  } catch {
    return null;
  }
}

function parseJsonRecords(value: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      : [];
  } catch {
    return [];
  }
}

function compact(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

export const classroomHistoryStore = new ClassroomHistoryStore();
