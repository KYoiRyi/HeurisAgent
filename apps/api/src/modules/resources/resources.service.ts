import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DB } from "@/persistence/persistence.module";
import type { Database } from "@/persistence/database";
import { learningResources, type LearningResource } from "@/persistence/schema";

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

export interface LearningResourceDto {
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

@Injectable()
export class ResourcesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async add(input: AddLearningResourceInput): Promise<LearningResourceDto> {
    const [row] = await this.db
      .insert(learningResources)
      .values({
        title: input.title.trim(),
        subject: input.subject.trim(),
        category: input.category ?? "document",
        content: input.content?.trim() || null,
        fileUrl: input.file_url?.trim() || null,
        tags: input.tags ?? [],
        difficulty: input.difficulty ?? "medium",
        createdBy: input.created_by ?? "system",
        isShared: input.is_shared === false ? false : true,
      })
      .returning();
    return toDto(row);
  }

  async getById(id: string): Promise<LearningResourceDto | null> {
    const realId = stripLocalPrefix(id);
    if (!realId) return null;
    const [row] = await this.db
      .select()
      .from(learningResources)
      .where(eq(learningResources.id, realId))
      .limit(1);
    return row ? toDto(row) : null;
  }

  async list(opts: ListLearningResourcesOptions = {}): Promise<LearningResourceDto[]> {
    const conditions = [eq(learningResources.isShared, true)];
    if (opts.subject) conditions.push(eq(learningResources.subject, opts.subject));
    if (opts.category) conditions.push(eq(learningResources.category, opts.category));
    if (opts.difficulty) conditions.push(eq(learningResources.difficulty, opts.difficulty));

    const rows = await this.db
      .select()
      .from(learningResources)
      .where(and(...conditions))
      .orderBy(desc(learningResources.createdAt))
      .limit(opts.limit ?? 50);

    return rows.map(toDto);
  }

  async delete(id: string): Promise<boolean> {
    const realId = stripLocalPrefix(id);
    if (!realId) return false;
    const rows = await this.db
      .delete(learningResources)
      .where(eq(learningResources.id, realId))
      .returning({ id: learningResources.id });
    return rows.length > 0;
  }
}

function stripLocalPrefix(id: string): string | null {
  if (!id) return null;
  return id.startsWith("local-") ? id.slice(6) : id;
}

function toDto(row: LearningResource): LearningResourceDto {
  return {
    id: `local-${row.id}`,
    title: row.title,
    subject: row.subject,
    category: row.category,
    content: row.content,
    file_url: row.fileUrl,
    tags: row.tags ?? [],
    difficulty: row.difficulty,
    created_by: row.createdBy,
    is_shared: row.isShared,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    storage: "local",
  };
}
