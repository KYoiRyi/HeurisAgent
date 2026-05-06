import { getDb } from "./db";

export interface LearningResource {
  id: string;
  title: string;
  subject: string;
  category: string;
  content: string | null;
  file_url: string | null;
  tags: string[];
  difficulty: string;
  created_by: string;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
  storage: "local";
}

export interface AddLearningResourceInput {
  title: string;
  subject: string;
  category?: string;
  content?: string | null;
  file_url?: string | null;
  tags?: string[];
  difficulty?: string;
  created_by?: string;
  is_shared?: boolean;
}

export interface ListLearningResourcesOptions {
  subject?: string | null;
  category?: string | null;
  difficulty?: string | null;
  limit?: number;
}

class ResourceStore {
  add(input: AddLearningResourceInput): LearningResource {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO learning_resources
        (title, subject, category, content, file_url, tags, difficulty, created_by, is_shared)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      input.title.trim(),
      input.subject.trim(),
      input.category ?? "document",
      input.content?.trim() || null,
      input.file_url?.trim() || null,
      JSON.stringify(input.tags ?? []),
      input.difficulty ?? "medium",
      input.created_by ?? "system",
      input.is_shared === false ? 0 : 1
    );

    return this.getById(info.lastInsertRowid as number)!;
  }

  getById(id: number): LearningResource | null {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM learning_resources WHERE id = ?")
      .get(id) as RawLearningResource | undefined;

    return row ? toLearningResource(row) : null;
  }

  list(opts: ListLearningResourcesOptions = {}): LearningResource[] {
    const db = getDb();
    const conditions = ["is_shared = 1"];
    const vals: unknown[] = [];

    if (opts.subject) {
      conditions.push("subject = ?");
      vals.push(opts.subject);
    }
    if (opts.category) {
      conditions.push("category = ?");
      vals.push(opts.category);
    }
    if (opts.difficulty) {
      conditions.push("difficulty = ?");
      vals.push(opts.difficulty);
    }

    const rows = db
      .prepare(`
        SELECT * FROM learning_resources
        WHERE ${conditions.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(...vals, opts.limit ?? 50) as RawLearningResource[];

    return rows.map(toLearningResource);
  }
}

interface RawLearningResource {
  id: number;
  title: string;
  subject: string;
  category: string;
  content: string | null;
  file_url: string | null;
  tags: string;
  difficulty: string;
  created_by: string;
  is_shared: number;
  created_at: string;
  updated_at: string;
}

function toLearningResource(row: RawLearningResource): LearningResource {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags);
  } catch {
    tags = [];
  }

  return {
    ...row,
    id: `local-${row.id}`,
    tags,
    is_shared: row.is_shared === 1,
    storage: "local",
  };
}

export const resourceStore = new ResourceStore();
