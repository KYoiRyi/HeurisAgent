import { pgTable, serial, timestamp, varchar, text, integer, jsonb, boolean, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// ============================================
// 教学资源表 - 多智能体共享知识基础
// ============================================
export const learningResources = pgTable(
	"learning_resources",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		title: varchar("title", { length: 255 }).notNull(),
		subject: varchar("subject", { length: 100 }).notNull(),
		category: varchar("category", { length: 50 }).notNull(), // document, video, exercise, note
		content: text("content"),
		file_url: varchar("file_url", { length: 500 }),
		tags: jsonb("tags").default([]),
		difficulty: varchar("difficulty", { length: 20 }).default("medium"), // easy, medium, hard
		created_by: varchar("created_by", { length: 100 }).default("system"),
		is_shared: boolean("is_shared").default(true).notNull(),
		metadata: jsonb("metadata"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("learning_resources_subject_idx").on(table.subject),
		index("learning_resources_category_idx").on(table.category),
		index("learning_resources_created_at_idx").on(table.created_at),
	]
);

// ============================================
// 课堂会话表 - 课堂互动智能体
// ============================================
export const classroomSessions = pgTable(
	"classroom_sessions",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		title: varchar("title", { length: 255 }).notNull(),
		subject: varchar("subject", { length: 100 }).notNull(),
		teacher: varchar("teacher", { length: 100 }).notNull(),
		status: varchar("status", { length: 20 }).default("active").notNull(), // active, ended
		topic_summary: text("topic_summary"),
		key_points: jsonb("key_points").default([]),
		resource_ids: jsonb("resource_ids").default([]),
		participant_count: integer("participant_count").default(0),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		ended_at: timestamp("ended_at", { withTimezone: true }),
	},
	(table) => [
		index("classroom_sessions_status_idx").on(table.status),
		index("classroom_sessions_subject_idx").on(table.subject),
		index("classroom_sessions_created_at_idx").on(table.created_at),
	]
);

// ============================================
// 课堂消息表 - 实时提问解答
// ============================================
export const classroomMessages = pgTable(
	"classroom_messages",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		session_id: varchar("session_id", { length: 36 }).notNull().references(() => classroomSessions.id),
		role: varchar("role", { length: 20 }).notNull(), // student, teacher, agent
		sender: varchar("sender", { length: 100 }).notNull(),
		content: text("content").notNull(),
		message_type: varchar("message_type", { length: 30 }).default("question"), // question, answer, explanation, note
		related_knowledge_points: jsonb("related_knowledge_points").default([]),
		agent_type: varchar("agent_type", { length: 30 }), // classroom, error, review
		parent_message_id: varchar("parent_message_id", { length: 36 }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("classroom_messages_session_id_idx").on(table.session_id),
		index("classroom_messages_created_at_idx").on(table.created_at),
		index("classroom_messages_role_idx").on(table.role),
	]
);

// ============================================
// 错题表 - 错题管理智能体
// ============================================
export const errorQuestions = pgTable(
	"error_questions",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		student_name: varchar("student_name", { length: 100 }).notNull(),
		subject: varchar("subject", { length: 100 }).notNull(),
		question_text: text("question_text").notNull(),
		student_answer: text("student_answer"),
		correct_answer: text("correct_answer"),
		error_type: varchar("error_type", { length: 50 }), // concept, calculation, careless, method
		error_analysis: text("error_analysis"),
		knowledge_points: jsonb("knowledge_points").default([]),
		difficulty: varchar("difficulty", { length: 20 }).default("medium"),
		similar_questions: jsonb("similar_questions").default([]),
		reinforcement_suggestions: text("reinforcement_suggestions"),
		status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, analyzed, reviewing, mastered
		review_count: integer("review_count").default(0),
		mastered: boolean("mastered").default(false).notNull(),
		session_id: varchar("session_id", { length: 36 }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("error_questions_student_name_idx").on(table.student_name),
		index("error_questions_subject_idx").on(table.subject),
		index("error_questions_error_type_idx").on(table.error_type),
		index("error_questions_status_idx").on(table.status),
		index("error_questions_created_at_idx").on(table.created_at),
	]
);

// ============================================
// 复习计划表 - 复习策略智能体
// ============================================
export const reviewPlans = pgTable(
	"review_plans",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		student_name: varchar("student_name", { length: 100 }).notNull(),
		subject: varchar("subject", { length: 100 }).notNull(),
		plan_title: varchar("plan_title", { length: 255 }).notNull(),
		plan_content: text("plan_content").notNull(),
		blind_spots: jsonb("blind_spots").default([]),
		schedule: jsonb("schedule").default([]),
		priority_topics: jsonb("priority_topics").default([]),
		review_strategy: text("review_strategy"),
		progress: integer("progress").default(0),
		total_tasks: integer("total_tasks").default(0),
		completed_tasks: integer("completed_tasks").default(0),
		status: varchar("status", { length: 20 }).default("active").notNull(), // active, completed, paused
		start_date: timestamp("start_date", { withTimezone: true }),
		end_date: timestamp("end_date", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("review_plans_student_name_idx").on(table.student_name),
		index("review_plans_subject_idx").on(table.subject),
		index("review_plans_status_idx").on(table.status),
		index("review_plans_created_at_idx").on(table.created_at),
	]
);

// ============================================
// 学习记录表 - 学生学习追踪
// ============================================
export const learningRecords = pgTable(
	"learning_records",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		student_name: varchar("student_name", { length: 100 }).notNull(),
		subject: varchar("subject", { length: 100 }).notNull(),
		record_type: varchar("record_type", { length: 30 }).notNull(), // classroom, error, review, resource
		agent_type: varchar("agent_type", { length: 30 }).notNull(), // classroom_agent, error_agent, review_agent
		description: text("description"),
		knowledge_point: varchar("knowledge_point", { length: 200 }),
		score: integer("score"),
		duration_minutes: integer("duration_minutes").default(0),
		details: jsonb("details"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("learning_records_student_name_idx").on(table.student_name),
		index("learning_records_subject_idx").on(table.subject),
		index("learning_records_record_type_idx").on(table.record_type),
		index("learning_records_agent_type_idx").on(table.agent_type),
		index("learning_records_created_at_idx").on(table.created_at),
	]
);

// ============================================
// 智能体任务表 - 多智能体协同调度
// ============================================
export const agentTasks = pgTable(
	"agent_tasks",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		task_type: varchar("task_type", { length: 50 }).notNull(), // classify_error, generate_plan, analyze_weakness, coordinate
		source_agent: varchar("source_agent", { length: 30 }).notNull(), // classroom_agent, error_agent, review_agent
		target_agent: varchar("target_agent", { length: 30 }),
		status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, running, completed, failed
		priority: varchar("priority", { length: 10 }).default("normal"), // low, normal, high, urgent
		input_data: jsonb("input_data"),
		output_data: jsonb("output_data"),
		error_message: text("error_message"),
		related_record_ids: jsonb("related_record_ids").default([]),
		started_at: timestamp("started_at", { withTimezone: true }),
		completed_at: timestamp("completed_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("agent_tasks_task_type_idx").on(table.task_type),
		index("agent_tasks_source_agent_idx").on(table.source_agent),
		index("agent_tasks_status_idx").on(table.status),
		index("agent_tasks_created_at_idx").on(table.created_at),
	]
);
