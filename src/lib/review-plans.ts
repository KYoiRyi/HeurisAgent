import { getDb } from "./db";

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

interface SaveReviewPlanInput {
  studentName: string;
  subject: string;
  planData: Record<string, unknown>;
  totalTasks: number;
}

class ReviewPlanStore {
  saveActive(input: SaveReviewPlanInput): LocalReviewPlan {
    const db = getDb();
    db.prepare("UPDATE review_plans SET status = 'completed', updated_at = datetime('now') WHERE subject = ? AND status = 'active'")
      .run(input.subject);

    const result = db
      .prepare(
        `INSERT INTO review_plans
          (student_name, subject, plan_title, plan_content, blind_spots, schedule,
           priority_topics, review_strategy, total_tasks, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
      )
      .run(
        input.studentName,
        input.subject,
        String(input.planData.plan_title || `${input.subject}复习计划`),
        String(input.planData.plan_content || ""),
        JSON.stringify(normalizeArray(input.planData.blind_spots)),
        JSON.stringify(normalizeArray(input.planData.schedule)),
        JSON.stringify(normalizeArray(input.planData.priority_topics)),
        String(input.planData.review_strategy || ""),
        input.totalTasks
      );

    return this.getById(result.lastInsertRowid as number)!;
  }

  getById(id: number): LocalReviewPlan | null {
    const row = getDb()
      .prepare("SELECT * FROM review_plans WHERE id = ?")
      .get(id) as RawReviewPlan | undefined;
    return row ? toReviewPlan(row) : null;
  }

  update(id: number, updates: { completed_tasks?: number; schedule?: string }): LocalReviewPlan | null {
    const db = getDb();
    const sets: string[] = [];
    const vals: unknown[] = [];

    if (updates.completed_tasks !== undefined) {
      sets.push("completed_tasks = ?");
      vals.push(updates.completed_tasks);
    }
    if (updates.schedule !== undefined) {
      sets.push("schedule = ?");
      vals.push(updates.schedule);
    }

    if (sets.length === 0) return this.getById(id);

    sets.push("updated_at = datetime('now')");
    vals.push(id);

    db.prepare(`UPDATE review_plans SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    return this.getById(id);
  }

  list(opts: { subject?: string | null; status?: string | null; limit?: number } = {}): LocalReviewPlan[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (opts.subject) {
      conditions.push("subject = ?");
      values.push(opts.subject);
    }
    if (opts.status) {
      conditions.push("status = ?");
      values.push(opts.status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = getDb()
      .prepare(
        `SELECT * FROM review_plans
         ${where}
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT ?`
      )
      .all(...values, opts.limit ?? 20) as RawReviewPlan[];

    return rows.map(toReviewPlan);
  }
}

interface RawReviewPlan {
  id: number;
  student_name: string;
  subject: string;
  plan_title: string;
  plan_content: string;
  blind_spots: string;
  schedule: string;
  priority_topics: string;
  review_strategy: string | null;
  progress: number;
  total_tasks: number;
  completed_tasks: number;
  status: string;
  created_at: string;
}

function toReviewPlan(row: RawReviewPlan): LocalReviewPlan {
  return {
    id: `local-${row.id}`,
    student_name: row.student_name,
    subject: row.subject,
    plan_title: row.plan_title,
    plan_content: row.plan_content,
    blind_spots: parseArray(row.blind_spots),
    schedule: parseArray(row.schedule),
    priority_topics: parseArray(row.priority_topics),
    review_strategy: row.review_strategy,
    progress: row.progress,
    total_tasks: row.total_tasks,
    completed_tasks: row.completed_tasks,
    status: row.status,
    created_at: row.created_at,
  };
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

export const reviewPlanStore = new ReviewPlanStore();
