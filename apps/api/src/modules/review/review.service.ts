import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { DB } from "@/persistence/persistence.module";
import type { Database } from "@/persistence/database";
import { reviewPlans, type ReviewPlan } from "@/persistence/schema";

export interface LocalReviewPlan {
  id: string;
  student_name: string;
  subject: string;
  plan_title: string;
  plan_content: string;
  blind_spots: string[];
  schedule: Array<{ day: string; tasks: string[]; duration_minutes: number }>;
  priority_topics: Array<{ topic: string; priority: string; reason: string }>;
  review_strategy: string | null;
  progress: number;
  total_tasks: number;
  completed_tasks: number;
  status: string;
  created_at: string;
}

export interface SaveReviewPlanInput {
  studentName: string;
  subject: string;
  planData: Record<string, unknown>;
  totalTasks: number;
}

@Injectable()
export class ReviewService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async saveActive(input: SaveReviewPlanInput): Promise<LocalReviewPlan> {
    await this.db
      .update(reviewPlans)
      .set({ status: "completed", updatedAt: new Date() })
      .where(and(eq(reviewPlans.subject, input.subject), eq(reviewPlans.status, "active")));

    const [row] = await this.db
      .insert(reviewPlans)
      .values({
        studentName: input.studentName,
        subject: input.subject,
        planTitle: String(input.planData.plan_title || `${input.subject}复习计划`),
        planContent: String(input.planData.plan_content || ""),
        blindSpots: normalizeStringArray(input.planData.blind_spots),
        schedule: normalizeArray(input.planData.schedule),
        priorityTopics: normalizeArray(input.planData.priority_topics),
        reviewStrategy: String(input.planData.review_strategy || ""),
        totalTasks: input.totalTasks,
        status: "active",
      })
      .returning();
    return toReviewPlan(row);
  }

  async getById(id: string): Promise<LocalReviewPlan | null> {
    const realId = stripLocalPrefix(id);
    if (!realId) return null;
    const [row] = await this.db.select().from(reviewPlans).where(eq(reviewPlans.id, realId)).limit(1);
    return row ? toReviewPlan(row) : null;
  }

  async update(
    id: string,
    updates: { completed_tasks?: number; schedule?: unknown[]; status?: string },
  ): Promise<LocalReviewPlan | null> {
    const realId = stripLocalPrefix(id);
    if (!realId) return null;

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.completed_tasks !== undefined) {
      set.completedTasks = updates.completed_tasks;
      set.progress = sql`CASE WHEN ${reviewPlans.totalTasks} > 0
        THEN LEAST(100, ROUND((${updates.completed_tasks}::numeric / ${reviewPlans.totalTasks}) * 100))
        ELSE 0 END`;
    }
    if (updates.schedule !== undefined) set.schedule = updates.schedule;
    if (updates.status !== undefined) set.status = updates.status;

    if (Object.keys(set).length === 1) return this.getById(id);

    const [row] = await this.db
      .update(reviewPlans)
      .set(set)
      .where(eq(reviewPlans.id, realId))
      .returning();
    return row ? toReviewPlan(row) : null;
  }

  async list(
    opts: { subject?: string | null; status?: string | null; limit?: number } = {},
  ): Promise<LocalReviewPlan[]> {
    const conditions = [] as ReturnType<typeof eq>[];
    if (opts.subject) conditions.push(eq(reviewPlans.subject, opts.subject));
    if (opts.status) conditions.push(eq(reviewPlans.status, opts.status));

    const rows = await this.db
      .select()
      .from(reviewPlans)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(reviewPlans.createdAt), desc(reviewPlans.id))
      .limit(opts.limit ?? 20);

    return rows.map(toReviewPlan);
  }
}

function stripLocalPrefix(id: string): string | null {
  if (!id) return null;
  return id.startsWith("local-") ? id.slice(6) : id;
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function toReviewPlan(row: ReviewPlan): LocalReviewPlan {
  return {
    id: `local-${row.id}`,
    student_name: row.studentName,
    subject: row.subject,
    plan_title: row.planTitle,
    plan_content: row.planContent,
    blind_spots: (row.blindSpots ?? []) as string[],
    schedule: (row.schedule ?? []) as LocalReviewPlan["schedule"],
    priority_topics: (row.priorityTopics ?? []) as unknown as LocalReviewPlan["priority_topics"],
    review_strategy: row.reviewStrategy,
    progress: row.progress,
    total_tasks: row.totalTasks,
    completed_tasks: row.completedTasks,
    status: row.status,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}
