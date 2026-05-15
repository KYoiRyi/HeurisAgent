import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { DB } from "@/persistence/persistence.module";
import type { Database } from "@/persistence/database";
import { errorQuestions, type ErrorQuestion } from "@/persistence/schema";

export interface ErrorQuestionDto {
  id: string;
  student_name: string;
  subject: string;
  question_text: string;
  student_answer: string | null;
  correct_answer: string | null;
  error_type: string | null;
  error_analysis: string | null;
  knowledge_points: string[];
  difficulty: string;
  similar_questions: unknown[];
  reinforcement_suggestions: string | null;
  status: string;
  review_count: number;
  mastered: boolean;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddErrorQuestionInput {
  student_name?: string;
  subject: string;
  question_text: string;
  student_answer?: string;
  correct_answer?: string;
  error_type?: string;
  error_analysis?: string;
  knowledge_points?: string[];
  difficulty?: string;
  similar_questions?: unknown[];
  reinforcement_suggestions?: string;
  session_id?: string;
}

export interface ListErrorQuestionsOptions {
  subject?: string | null;
  studentName?: string | null;
  errorType?: string | null;
  status?: string | null;
  limit?: number;
}

@Injectable()
export class ErrorsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async add(input: AddErrorQuestionInput): Promise<ErrorQuestionDto> {
    const [row] = await this.db
      .insert(errorQuestions)
      .values({
        studentName: input.student_name?.trim() || "默认学习者",
        subject: input.subject.trim(),
        questionText: input.question_text.trim(),
        studentAnswer: input.student_answer ?? null,
        correctAnswer: input.correct_answer ?? null,
        errorType: input.error_type ?? null,
        errorAnalysis: input.error_analysis ?? null,
        knowledgePoints: input.knowledge_points ?? [],
        difficulty: input.difficulty ?? "medium",
        similarQuestions: input.similar_questions ?? [],
        reinforcementSuggestions: input.reinforcement_suggestions ?? null,
        sessionId: input.session_id ?? null,
      })
      .returning();
    return toDto(row);
  }

  async getById(id: string): Promise<ErrorQuestionDto | null> {
    const realId = stripLocalPrefix(id);
    if (!realId) return null;
    const [row] = await this.db
      .select()
      .from(errorQuestions)
      .where(eq(errorQuestions.id, realId))
      .limit(1);
    return row ? toDto(row) : null;
  }

  async list(opts: ListErrorQuestionsOptions = {}): Promise<ErrorQuestionDto[]> {
    const conditions = [] as ReturnType<typeof eq>[];
    if (opts.subject) conditions.push(eq(errorQuestions.subject, opts.subject));
    if (opts.studentName) conditions.push(eq(errorQuestions.studentName, opts.studentName));
    if (opts.errorType) conditions.push(eq(errorQuestions.errorType, opts.errorType));
    if (opts.status) conditions.push(eq(errorQuestions.status, opts.status));

    const rows = await this.db
      .select()
      .from(errorQuestions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(errorQuestions.createdAt))
      .limit(opts.limit ?? 50);

    return rows.map(toDto);
  }

  async update(
    id: string,
    patch: {
      status?: string;
      mastered?: boolean;
      reinforcement_suggestions?: string;
      similar_questions?: unknown[];
      review_count_delta?: number;
    },
  ): Promise<ErrorQuestionDto | null> {
    const realId = stripLocalPrefix(id);
    if (!realId) return null;

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.mastered !== undefined) set.mastered = patch.mastered;
    if (patch.reinforcement_suggestions !== undefined)
      set.reinforcementSuggestions = patch.reinforcement_suggestions;
    if (patch.similar_questions !== undefined) set.similarQuestions = patch.similar_questions;
    if (patch.review_count_delta !== undefined)
      set.reviewCount = sql`${errorQuestions.reviewCount} + ${patch.review_count_delta}`;

    if (Object.keys(set).length === 1) return this.getById(id);

    const [row] = await this.db
      .update(errorQuestions)
      .set(set)
      .where(eq(errorQuestions.id, realId))
      .returning();
    return row ? toDto(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const realId = stripLocalPrefix(id);
    if (!realId) return false;
    const rows = await this.db
      .delete(errorQuestions)
      .where(eq(errorQuestions.id, realId))
      .returning({ id: errorQuestions.id });
    return rows.length > 0;
  }

  async stats(opts: { studentName?: string; subject?: string } = {}) {
    const conditions = [] as ReturnType<typeof eq>[];
    if (opts.studentName) conditions.push(eq(errorQuestions.studentName, opts.studentName));
    if (opts.subject) conditions.push(eq(errorQuestions.subject, opts.subject));
    const where = conditions.length ? and(...conditions) : undefined;

    const [totalRow] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(errorQuestions)
      .where(where);

    const byType = await this.db
      .select({
        errorType: errorQuestions.errorType,
        count: sql<number>`count(*)::int`,
      })
      .from(errorQuestions)
      .where(where)
      .groupBy(errorQuestions.errorType);

    const bySubject = await this.db
      .select({
        subject: errorQuestions.subject,
        count: sql<number>`count(*)::int`,
      })
      .from(errorQuestions)
      .where(where)
      .groupBy(errorQuestions.subject);

    const [masteredRow] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(errorQuestions)
      .where(
        conditions.length
          ? and(...conditions, eq(errorQuestions.mastered, true))
          : eq(errorQuestions.mastered, true),
      );

    return {
      total: totalRow?.c ?? 0,
      mastered: masteredRow?.c ?? 0,
      byType: byType.map((r) => ({ errorType: r.errorType ?? "unknown", count: r.count })),
      bySubject: bySubject.map((r) => ({ subject: r.subject, count: r.count })),
    };
  }
}

function stripLocalPrefix(id: string): string | null {
  if (!id) return null;
  return id.startsWith("local-") ? id.slice(6) : id;
}

function toDto(row: ErrorQuestion): ErrorQuestionDto {
  return {
    id: `local-${row.id}`,
    student_name: row.studentName,
    subject: row.subject,
    question_text: row.questionText,
    student_answer: row.studentAnswer,
    correct_answer: row.correctAnswer,
    error_type: row.errorType,
    error_analysis: row.errorAnalysis,
    knowledge_points: row.knowledgePoints ?? [],
    difficulty: row.difficulty,
    similar_questions: (row.similarQuestions ?? []) as unknown[],
    reinforcement_suggestions: row.reinforcementSuggestions,
    status: row.status,
    review_count: row.reviewCount,
    mastered: row.mastered,
    session_id: row.sessionId,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}
