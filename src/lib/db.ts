/**
 * SQLite database initialization for the local agent system.
 *
 * File: data/agent.db  (auto-created, gitignored)
 *
 * Tables:
 *   memories   — persistent facts / notes across sessions
 *   sessions   — chat session history for memory recall
 *   cron_jobs  — scheduled background tasks
 *   task_runs  — log of cron/manual task executions
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "agent.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    -- ── Memories ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS memories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      content     TEXT    NOT NULL,
      source      TEXT    NOT NULL DEFAULT 'manual',   -- manual|classroom|error|review|cron|auto
      tags        TEXT    NOT NULL DEFAULT '[]',        -- JSON array
      importance  INTEGER NOT NULL DEFAULT 1,           -- 1=normal 2=important 3=critical
      pinned      INTEGER NOT NULL DEFAULT 0,
      session_id  TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS memories_created_idx ON memories(created_at DESC);
    CREATE INDEX IF NOT EXISTS memories_source_idx  ON memories(source);
    CREATE INDEX IF NOT EXISTS memories_pinned_idx  ON memories(pinned DESC, importance DESC);

    -- FTS for search
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      tags,
      content='memories',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, tags) VALUES (new.id, new.content, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.id, old.content, old.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.id, old.content, old.tags);
      INSERT INTO memories_fts(rowid, content, tags) VALUES (new.id, new.content, new.tags);
    END;

    -- ── Cron Jobs ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS cron_jobs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      schedule    TEXT    NOT NULL,          -- cron expr or human string
      prompt      TEXT    NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1,
      last_run    TEXT,
      next_run    TEXT,
      run_count   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Task Runs ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS task_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id      INTEGER REFERENCES cron_jobs(id) ON DELETE SET NULL,
      trigger     TEXT    NOT NULL DEFAULT 'manual',  -- manual|cron|api
      prompt      TEXT    NOT NULL,
      result      TEXT,
      status      TEXT    NOT NULL DEFAULT 'running', -- running|done|failed
      tokens_used INTEGER DEFAULT 0,
      started_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS task_runs_job_idx     ON task_runs(job_id);
    CREATE INDEX IF NOT EXISTS task_runs_started_idx ON task_runs(started_at DESC);

    -- ── Agent notes (user profile, facts the agent curates about you) ────────
    CREATE TABLE IF NOT EXISTS agent_notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category    TEXT    NOT NULL DEFAULT 'general', -- general|preference|fact|goal
      content     TEXT    NOT NULL,
      confidence  REAL    NOT NULL DEFAULT 1.0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Local learning resources fallback ───────────────────────────────────
    -- Mirrors the Supabase learning_resources shape so classroom docs still
    -- work when Supabase is not configured or temporarily unavailable.
    CREATE TABLE IF NOT EXISTS learning_resources (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      subject     TEXT    NOT NULL,
      category    TEXT    NOT NULL DEFAULT 'document',
      content     TEXT,
      file_url    TEXT,
      tags        TEXT    NOT NULL DEFAULT '[]',
      difficulty  TEXT    NOT NULL DEFAULT 'medium',
      created_by  TEXT    NOT NULL DEFAULT 'system',
      is_shared   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS learning_resources_subject_idx ON learning_resources(subject);
    CREATE INDEX IF NOT EXISTS learning_resources_category_idx ON learning_resources(category);
    CREATE INDEX IF NOT EXISTS learning_resources_created_idx ON learning_resources(created_at DESC);

    -- ── Local classroom transcript history ─────────────────────────────────
    -- Full classroom turns live here, grouped by subject. They are deliberately
    -- separate from memories so long-term recall stays focused on knowledge,
    -- weaknesses, preferences, and errors instead of raw transcripts.
    CREATE TABLE IF NOT EXISTS classroom_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT,
      subject     TEXT    NOT NULL,
      role        TEXT    NOT NULL,          -- student|agent
      content     TEXT    NOT NULL,
      message_type TEXT   NOT NULL DEFAULT 'message',
      related_knowledge_points TEXT NOT NULL DEFAULT '[]',
      live_component TEXT,
      tool_calls TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS classroom_history_subject_idx ON classroom_history(subject);
    CREATE INDEX IF NOT EXISTS classroom_history_created_idx ON classroom_history(created_at DESC);
    CREATE INDEX IF NOT EXISTS classroom_history_session_idx ON classroom_history(session_id);

    -- ── Local review plan fallback ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS review_plans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT   NOT NULL DEFAULT '默认学习者',
      subject     TEXT    NOT NULL,
      plan_title  TEXT    NOT NULL,
      plan_content TEXT   NOT NULL DEFAULT '',
      blind_spots TEXT    NOT NULL DEFAULT '[]',
      schedule    TEXT    NOT NULL DEFAULT '[]',
      priority_topics TEXT NOT NULL DEFAULT '[]',
      review_strategy TEXT,
      progress    INTEGER NOT NULL DEFAULT 0,
      total_tasks INTEGER NOT NULL DEFAULT 0,
      completed_tasks INTEGER NOT NULL DEFAULT 0,
      status      TEXT    NOT NULL DEFAULT 'active',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS review_plans_subject_idx ON review_plans(subject);
    CREATE INDEX IF NOT EXISTS review_plans_status_idx ON review_plans(status);
    CREATE INDEX IF NOT EXISTS review_plans_created_idx ON review_plans(created_at DESC);
  `);

  ensureColumn(_db, "classroom_history", "tool_calls", "TEXT NOT NULL DEFAULT '[]'");

  return _db;
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}

/** Close the database (used in tests / graceful shutdown) */
export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
