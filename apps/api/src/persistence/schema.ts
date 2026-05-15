/**
 * Unified PostgreSQL schema for HeurisAgent.
 *
 * All persistence (memory, classroom, errors, review, resources, tasks, cron)
 * lives here. Backed by PGlite in dev/single-user, swappable to a real
 * PostgreSQL via DATABASE_URL.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  index,
  real,
  uuid,
  customType,
} from "drizzle-orm/pg-core";

// PG tsvector type for full-text search of memories.
const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

// ─── Memories (long-term agent memory + FTS) ────────────────────────────────
export const memories = pgTable(
  "memories",
  {
    id: serial("id").primaryKey(),
    content: text("content").notNull(),
    source: varchar("source", { length: 32 }).notNull().default("manual"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    importance: integer("importance").notNull().default(1),
    pinned: boolean("pinned").notNull().default(false),
    sessionId: varchar("session_id", { length: 64 }),
    fts: tsvector("fts"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("memories_created_idx").on(t.createdAt.desc()),
    index("memories_source_idx").on(t.source),
    index("memories_pinned_idx").on(t.pinned, t.importance),
    index("memories_fts_idx").using("gin", t.fts),
  ],
);

// ─── Agent Notes (curated user profile facts) ───────────────────────────────
export const agentNotes = pgTable("agent_notes", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 32 }).notNull().default("general"),
  content: text("content").notNull(),
  confidence: real("confidence").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Cron Jobs ──────────────────────────────────────────────────────────────
export const cronJobs = pgTable(
  "cron_jobs",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    schedule: varchar("schedule", { length: 100 }).notNull(),
    prompt: text("prompt").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastRun: timestamp("last_run", { withTimezone: true }),
    nextRun: timestamp("next_run", { withTimezone: true }),
    runCount: integer("run_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cron_jobs_enabled_idx").on(t.enabled)],
);

// ─── Task Runs (execution log) ──────────────────────────────────────────────
export const taskRuns = pgTable(
  "task_runs",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").references(() => cronJobs.id, { onDelete: "set null" }),
    trigger: varchar("trigger", { length: 32 }).notNull().default("manual"),
    prompt: text("prompt").notNull(),
    result: text("result"),
    status: varchar("status", { length: 16 }).notNull().default("running"),
    tokensUsed: integer("tokens_used").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("task_runs_job_idx").on(t.jobId),
    index("task_runs_started_idx").on(t.startedAt.desc()),
    index("task_runs_status_idx").on(t.status),
  ],
);

// ─── Learning Resources (shared knowledge base) ─────────────────────────────
export const learningResources = pgTable(
  "learning_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 100 }).notNull(),
    category: varchar("category", { length: 50 }).notNull().default("document"),
    content: text("content"),
    fileUrl: varchar("file_url", { length: 500 }),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    difficulty: varchar("difficulty", { length: 20 }).notNull().default("medium"),
    createdBy: varchar("created_by", { length: 100 }).notNull().default("system"),
    isShared: boolean("is_shared").notNull().default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("learning_resources_subject_idx").on(t.subject),
    index("learning_resources_category_idx").on(t.category),
    index("learning_resources_created_idx").on(t.createdAt.desc()),
  ],
);

// ─── Classroom Sessions ─────────────────────────────────────────────────────
export const classroomSessions = pgTable(
  "classroom_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 100 }).notNull(),
    teacher: varchar("teacher", { length: 100 }).notNull().default("HeurisAgent"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    topicSummary: text("topic_summary"),
    keyPoints: jsonb("key_points").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    resourceIds: jsonb("resource_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    participantCount: integer("participant_count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("classroom_sessions_status_idx").on(t.status),
    index("classroom_sessions_subject_idx").on(t.subject),
    index("classroom_sessions_created_idx").on(t.createdAt.desc()),
  ],
);

// ─── Classroom Messages (per-session structured messages) ───────────────────
export const classroomMessages = pgTable(
  "classroom_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => classroomSessions.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    sender: varchar("sender", { length: 100 }).notNull().default("anonymous"),
    content: text("content").notNull(),
    messageType: varchar("message_type", { length: 30 }).notNull().default("question"),
    relatedKnowledgePoints: jsonb("related_knowledge_points").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    agentType: varchar("agent_type", { length: 30 }),
    parentMessageId: uuid("parent_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("classroom_messages_session_idx").on(t.sessionId),
    index("classroom_messages_created_idx").on(t.createdAt.desc()),
    index("classroom_messages_role_idx").on(t.role),
  ],
);

// ─── Classroom History (raw transcript per subject) ─────────────────────────
export const classroomHistory = pgTable(
  "classroom_history",
  {
    id: serial("id").primaryKey(),
    sessionId: varchar("session_id", { length: 64 }),
    subject: varchar("subject", { length: 100 }).notNull(),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    messageType: varchar("message_type", { length: 30 }).notNull().default("message"),
    relatedKnowledgePoints: jsonb("related_knowledge_points").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    liveComponent: jsonb("live_component"),
    liveComponents: jsonb("live_components").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    stageType: varchar("stage_type", { length: 30 }),
    toolCalls: jsonb("tool_calls").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("classroom_history_subject_idx").on(t.subject),
    index("classroom_history_session_idx").on(t.sessionId),
    index("classroom_history_created_idx").on(t.createdAt.desc()),
  ],
);

// ─── Error Questions ────────────────────────────────────────────────────────
export const errorQuestions = pgTable(
  "error_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentName: varchar("student_name", { length: 100 }).notNull().default("默认学习者"),
    subject: varchar("subject", { length: 100 }).notNull(),
    questionText: text("question_text").notNull(),
    studentAnswer: text("student_answer"),
    correctAnswer: text("correct_answer"),
    errorType: varchar("error_type", { length: 50 }),
    errorAnalysis: text("error_analysis"),
    knowledgePoints: jsonb("knowledge_points").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    difficulty: varchar("difficulty", { length: 20 }).notNull().default("medium"),
    similarQuestions: jsonb("similar_questions").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    reinforcementSuggestions: text("reinforcement_suggestions"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reviewCount: integer("review_count").notNull().default(0),
    mastered: boolean("mastered").notNull().default(false),
    sessionId: varchar("session_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("error_questions_student_idx").on(t.studentName),
    index("error_questions_subject_idx").on(t.subject),
    index("error_questions_type_idx").on(t.errorType),
    index("error_questions_status_idx").on(t.status),
    index("error_questions_created_idx").on(t.createdAt.desc()),
  ],
);

// ─── Review Plans ───────────────────────────────────────────────────────────
export const reviewPlans = pgTable(
  "review_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentName: varchar("student_name", { length: 100 }).notNull().default("默认学习者"),
    subject: varchar("subject", { length: 100 }).notNull(),
    planTitle: varchar("plan_title", { length: 255 }).notNull(),
    planContent: text("plan_content").notNull().default(""),
    blindSpots: jsonb("blind_spots").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    schedule: jsonb("schedule").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    priorityTopics: jsonb("priority_topics").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    reviewStrategy: text("review_strategy"),
    progress: integer("progress").notNull().default(0),
    totalTasks: integer("total_tasks").notNull().default(0),
    completedTasks: integer("completed_tasks").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_plans_student_idx").on(t.studentName),
    index("review_plans_subject_idx").on(t.subject),
    index("review_plans_status_idx").on(t.status),
    index("review_plans_created_idx").on(t.createdAt.desc()),
  ],
);

// ─── Learning Records (cross-agent activity log) ────────────────────────────
export const learningRecords = pgTable(
  "learning_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentName: varchar("student_name", { length: 100 }).notNull().default("默认学习者"),
    subject: varchar("subject", { length: 100 }).notNull(),
    recordType: varchar("record_type", { length: 30 }).notNull(),
    agentType: varchar("agent_type", { length: 30 }).notNull(),
    description: text("description"),
    knowledgePoint: varchar("knowledge_point", { length: 200 }),
    score: integer("score"),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("learning_records_student_idx").on(t.studentName),
    index("learning_records_subject_idx").on(t.subject),
    index("learning_records_record_type_idx").on(t.recordType),
    index("learning_records_agent_type_idx").on(t.agentType),
    index("learning_records_created_idx").on(t.createdAt.desc()),
  ],
);

// ─── Agent Tasks (multi-agent coordination) ─────────────────────────────────
export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskType: varchar("task_type", { length: 50 }).notNull(),
    sourceAgent: varchar("source_agent", { length: 30 }).notNull(),
    targetAgent: varchar("target_agent", { length: 30 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    priority: varchar("priority", { length: 10 }).notNull().default("normal"),
    inputData: jsonb("input_data"),
    outputData: jsonb("output_data"),
    errorMessage: text("error_message"),
    relatedRecordIds: jsonb("related_record_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("agent_tasks_task_type_idx").on(t.taskType),
    index("agent_tasks_source_agent_idx").on(t.sourceAgent),
    index("agent_tasks_status_idx").on(t.status),
    index("agent_tasks_created_idx").on(t.createdAt.desc()),
  ],
);

// ─── App Settings (single-row key/value bag for active LLM config) ──────────
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type LearningResource = typeof learningResources.$inferSelect;
export type NewLearningResource = typeof learningResources.$inferInsert;
export type ClassroomHistoryRow = typeof classroomHistory.$inferSelect;
export type NewClassroomHistory = typeof classroomHistory.$inferInsert;
export type ErrorQuestion = typeof errorQuestions.$inferSelect;
export type NewErrorQuestion = typeof errorQuestions.$inferInsert;
export type ReviewPlan = typeof reviewPlans.$inferSelect;
export type NewReviewPlan = typeof reviewPlans.$inferInsert;
export type AgentTask = typeof agentTasks.$inferSelect;
export type NewAgentTask = typeof agentTasks.$inferInsert;
export type CronJob = typeof cronJobs.$inferSelect;
export type NewCronJob = typeof cronJobs.$inferInsert;
export type TaskRun = typeof taskRuns.$inferSelect;
export type NewTaskRun = typeof taskRuns.$inferInsert;
