import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { DB } from "@/persistence/persistence.module";
import type { Database } from "@/persistence/database";
import { classroomSessions, classroomHistory } from "@/persistence/schema";

export interface SessionSummary {
  id: string;
  title: string;
  subject: string;
  status: string;
  messageCount: number;
  createdAt: string;
  endedAt: string | null;
}

@Injectable()
export class ClassroomSessionsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(opts: { subject?: string | null; status?: string | null; limit?: number } = {}): Promise<SessionSummary[]> {
    const conditions = [] as ReturnType<typeof eq>[];
    if (opts.subject) conditions.push(eq(classroomSessions.subject, opts.subject));
    if (opts.status) conditions.push(eq(classroomSessions.status, opts.status));

    const rows = await this.db
      .select()
      .from(classroomSessions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(classroomSessions.createdAt))
      .limit(opts.limit ?? 30);

    const sessionIds = rows.map((r) => r.id);
    const counts = sessionIds.length > 0
      ? await this.db
          .select({
            sessionId: classroomHistory.sessionId,
            count: sql<number>`count(*)::int`,
          })
          .from(classroomHistory)
          .where(sql`${classroomHistory.sessionId} = ANY(${sessionIds})`)
          .groupBy(classroomHistory.sessionId)
      : [];

    const countMap = new Map(counts.map((c) => [c.sessionId, c.count]));

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      subject: r.subject,
      status: r.status,
      messageCount: countMap.get(r.id) ?? 0,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      endedAt: r.endedAt instanceof Date ? r.endedAt.toISOString() : r.endedAt ? String(r.endedAt) : null,
    }));
  }

  async create(input: { title: string; subject: string }): Promise<SessionSummary> {
    const [row] = await this.db
      .insert(classroomSessions)
      .values({
        title: input.title,
        subject: input.subject,
        status: "active",
      })
      .returning();
    return {
      id: row.id,
      title: row.title,
      subject: row.subject,
      status: row.status,
      messageCount: 0,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      endedAt: null,
    };
  }

  async archive(id: string): Promise<SessionSummary | null> {
    const [row] = await this.db
      .update(classroomSessions)
      .set({ status: "archived", endedAt: new Date() })
      .where(eq(classroomSessions.id, id))
      .returning();
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      subject: row.subject,
      status: row.status,
      messageCount: 0,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      endedAt: row.endedAt instanceof Date ? row.endedAt.toISOString() : null,
    };
  }

  async ensureSession(sessionId: string | undefined, subject: string): Promise<string> {
    if (!sessionId) {
      const session = await this.create({
        title: `${subject} 课堂 ${new Date().toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        subject,
      });
      return session.id;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
    if (!isUuid) {
      const session = await this.create({
        title: `${subject} 课堂 ${new Date().toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        subject,
      });
      return session.id;
    }

    const existing = await this.db
      .select({ id: classroomSessions.id })
      .from(classroomSessions)
      .where(eq(classroomSessions.id, sessionId))
      .limit(1);
    if (existing.length > 0) return sessionId;

    const [row] = await this.db
      .insert(classroomSessions)
      .values({
        id: sessionId,
        title: `${subject} 课堂 ${new Date().toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        subject,
        status: "active",
      })
      .returning();
    return row.id;
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await this.db
      .update(classroomSessions)
      .set({ title })
      .where(eq(classroomSessions.id, id));
  }
}
