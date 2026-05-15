/**
 * One-shot DDL bootstrap mirrored from src/persistence/schema.ts.
 *
 * Used on first boot of an empty PGlite database before any drizzle-kit
 * generated migration has been produced. Idempotent (CREATE TABLE IF NOT
 * EXISTS), safe to run repeatedly.
 */
import type { Database } from "./database";

const DDL = `
CREATE TABLE IF NOT EXISTS memories (
  id           SERIAL PRIMARY KEY,
  content      TEXT        NOT NULL,
  source       VARCHAR(32) NOT NULL DEFAULT 'manual',
  tags         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  importance   INTEGER     NOT NULL DEFAULT 1,
  pinned       BOOLEAN     NOT NULL DEFAULT FALSE,
  session_id   VARCHAR(64),
  fts          TSVECTOR,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS memories_created_idx ON memories (created_at DESC);
CREATE INDEX IF NOT EXISTS memories_source_idx  ON memories (source);
CREATE INDEX IF NOT EXISTS memories_pinned_idx  ON memories (pinned, importance);
CREATE INDEX IF NOT EXISTS memories_fts_idx     ON memories USING GIN (fts);

CREATE TABLE IF NOT EXISTS agent_notes (
  id          SERIAL PRIMARY KEY,
  category    VARCHAR(32) NOT NULL DEFAULT 'general',
  content     TEXT        NOT NULL,
  confidence  REAL        NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cron_jobs (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  schedule   VARCHAR(100) NOT NULL,
  prompt     TEXT         NOT NULL,
  enabled    BOOLEAN      NOT NULL DEFAULT TRUE,
  last_run   TIMESTAMPTZ,
  next_run   TIMESTAMPTZ,
  run_count  INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cron_jobs_enabled_idx ON cron_jobs (enabled);

CREATE TABLE IF NOT EXISTS task_runs (
  id          SERIAL PRIMARY KEY,
  job_id      INTEGER REFERENCES cron_jobs(id) ON DELETE SET NULL,
  trigger     VARCHAR(32) NOT NULL DEFAULT 'manual',
  prompt      TEXT        NOT NULL,
  result      TEXT,
  status      VARCHAR(16) NOT NULL DEFAULT 'running',
  tokens_used INTEGER     NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS task_runs_job_idx     ON task_runs (job_id);
CREATE INDEX IF NOT EXISTS task_runs_started_idx ON task_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS task_runs_status_idx  ON task_runs (status);

CREATE TABLE IF NOT EXISTS learning_resources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(255) NOT NULL,
  subject     VARCHAR(100) NOT NULL,
  category    VARCHAR(50)  NOT NULL DEFAULT 'document',
  content     TEXT,
  file_url    VARCHAR(500),
  tags        JSONB        NOT NULL DEFAULT '[]'::jsonb,
  difficulty  VARCHAR(20)  NOT NULL DEFAULT 'medium',
  created_by  VARCHAR(100) NOT NULL DEFAULT 'system',
  is_shared   BOOLEAN      NOT NULL DEFAULT TRUE,
  metadata    JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS learning_resources_subject_idx  ON learning_resources (subject);
CREATE INDEX IF NOT EXISTS learning_resources_category_idx ON learning_resources (category);
CREATE INDEX IF NOT EXISTS learning_resources_created_idx  ON learning_resources (created_at DESC);

CREATE TABLE IF NOT EXISTS classroom_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              VARCHAR(255) NOT NULL,
  subject            VARCHAR(100) NOT NULL,
  teacher            VARCHAR(100) NOT NULL DEFAULT 'HeurisAgent',
  status             VARCHAR(20)  NOT NULL DEFAULT 'active',
  topic_summary      TEXT,
  key_points         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  resource_ids       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  participant_count  INTEGER      NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ended_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS classroom_sessions_status_idx  ON classroom_sessions (status);
CREATE INDEX IF NOT EXISTS classroom_sessions_subject_idx ON classroom_sessions (subject);
CREATE INDEX IF NOT EXISTS classroom_sessions_created_idx ON classroom_sessions (created_at DESC);

CREATE TABLE IF NOT EXISTS classroom_messages (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                UUID REFERENCES classroom_sessions(id) ON DELETE CASCADE,
  role                      VARCHAR(20)  NOT NULL,
  sender                    VARCHAR(100) NOT NULL DEFAULT 'anonymous',
  content                   TEXT         NOT NULL,
  message_type              VARCHAR(30)  NOT NULL DEFAULT 'question',
  related_knowledge_points  JSONB        NOT NULL DEFAULT '[]'::jsonb,
  agent_type                VARCHAR(30),
  parent_message_id         UUID,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS classroom_messages_session_idx ON classroom_messages (session_id);
CREATE INDEX IF NOT EXISTS classroom_messages_created_idx ON classroom_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS classroom_messages_role_idx    ON classroom_messages (role);

CREATE TABLE IF NOT EXISTS classroom_history (
  id                        SERIAL PRIMARY KEY,
  session_id                VARCHAR(64),
  subject                   VARCHAR(100) NOT NULL,
  role                      VARCHAR(20)  NOT NULL,
  content                   TEXT         NOT NULL,
  message_type              VARCHAR(30)  NOT NULL DEFAULT 'message',
  related_knowledge_points  JSONB        NOT NULL DEFAULT '[]'::jsonb,
  live_component            JSONB,
  tool_calls                JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS classroom_history_subject_idx ON classroom_history (subject);
CREATE INDEX IF NOT EXISTS classroom_history_session_idx ON classroom_history (session_id);
CREATE INDEX IF NOT EXISTS classroom_history_created_idx ON classroom_history (created_at DESC);

CREATE TABLE IF NOT EXISTS error_questions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name                VARCHAR(100) NOT NULL DEFAULT '默认学习者',
  subject                     VARCHAR(100) NOT NULL,
  question_text               TEXT         NOT NULL,
  student_answer              TEXT,
  correct_answer              TEXT,
  error_type                  VARCHAR(50),
  error_analysis              TEXT,
  knowledge_points            JSONB        NOT NULL DEFAULT '[]'::jsonb,
  difficulty                  VARCHAR(20)  NOT NULL DEFAULT 'medium',
  similar_questions           JSONB        NOT NULL DEFAULT '[]'::jsonb,
  reinforcement_suggestions   TEXT,
  status                      VARCHAR(20)  NOT NULL DEFAULT 'pending',
  review_count                INTEGER      NOT NULL DEFAULT 0,
  mastered                    BOOLEAN      NOT NULL DEFAULT FALSE,
  session_id                  VARCHAR(64),
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS error_questions_student_idx ON error_questions (student_name);
CREATE INDEX IF NOT EXISTS error_questions_subject_idx ON error_questions (subject);
CREATE INDEX IF NOT EXISTS error_questions_type_idx    ON error_questions (error_type);
CREATE INDEX IF NOT EXISTS error_questions_status_idx  ON error_questions (status);
CREATE INDEX IF NOT EXISTS error_questions_created_idx ON error_questions (created_at DESC);

CREATE TABLE IF NOT EXISTS review_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name      VARCHAR(100) NOT NULL DEFAULT '默认学习者',
  subject           VARCHAR(100) NOT NULL,
  plan_title        VARCHAR(255) NOT NULL,
  plan_content      TEXT         NOT NULL DEFAULT '',
  blind_spots       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  schedule          JSONB        NOT NULL DEFAULT '[]'::jsonb,
  priority_topics   JSONB        NOT NULL DEFAULT '[]'::jsonb,
  review_strategy   TEXT,
  progress          INTEGER      NOT NULL DEFAULT 0,
  total_tasks       INTEGER      NOT NULL DEFAULT 0,
  completed_tasks   INTEGER      NOT NULL DEFAULT 0,
  status            VARCHAR(20)  NOT NULL DEFAULT 'active',
  start_date        TIMESTAMPTZ,
  end_date          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS review_plans_student_idx ON review_plans (student_name);
CREATE INDEX IF NOT EXISTS review_plans_subject_idx ON review_plans (subject);
CREATE INDEX IF NOT EXISTS review_plans_status_idx  ON review_plans (status);
CREATE INDEX IF NOT EXISTS review_plans_created_idx ON review_plans (created_at DESC);

CREATE TABLE IF NOT EXISTS learning_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name      VARCHAR(100) NOT NULL DEFAULT '默认学习者',
  subject           VARCHAR(100) NOT NULL,
  record_type       VARCHAR(30)  NOT NULL,
  agent_type        VARCHAR(30)  NOT NULL,
  description       TEXT,
  knowledge_point   VARCHAR(200),
  score             INTEGER,
  duration_minutes  INTEGER      NOT NULL DEFAULT 0,
  details           JSONB,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS learning_records_student_idx     ON learning_records (student_name);
CREATE INDEX IF NOT EXISTS learning_records_subject_idx     ON learning_records (subject);
CREATE INDEX IF NOT EXISTS learning_records_record_type_idx ON learning_records (record_type);
CREATE INDEX IF NOT EXISTS learning_records_agent_type_idx  ON learning_records (agent_type);
CREATE INDEX IF NOT EXISTS learning_records_created_idx     ON learning_records (created_at DESC);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type           VARCHAR(50) NOT NULL,
  source_agent        VARCHAR(30) NOT NULL,
  target_agent        VARCHAR(30),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending',
  priority            VARCHAR(10) NOT NULL DEFAULT 'normal',
  input_data          JSONB,
  output_data         JSONB,
  error_message       TEXT,
  related_record_ids  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agent_tasks_task_type_idx    ON agent_tasks (task_type);
CREATE INDEX IF NOT EXISTS agent_tasks_source_agent_idx ON agent_tasks (source_agent);
CREATE INDEX IF NOT EXISTS agent_tasks_status_idx       ON agent_tasks (status);
CREATE INDEX IF NOT EXISTS agent_tasks_created_idx      ON agent_tasks (created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key        VARCHAR(64) PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export async function bootstrap(db: Database): Promise<void> {
  for (const stmt of splitStatements(DDL)) {
    await db.execute(stmt);
  }
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s + ";");
}
