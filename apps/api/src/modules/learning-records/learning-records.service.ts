import { Inject, Injectable } from "@nestjs/common";
import { DB } from "@/persistence/persistence.module";
import type { Database } from "@/persistence/database";
import { learningRecords } from "@/persistence/schema";

@Injectable()
export class LearningRecordsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async recordScore(input: {
    studentName: string;
    subject: string;
    score: number;
    knowledgePoint?: string;
    stageType?: string;
    sessionId?: string;
    details?: unknown;
  }) {
    await this.db.insert(learningRecords).values({
      studentName: input.studentName,
      subject: input.subject,
      recordType: "stage_score",
      agentType: "classroom",
      score: input.score,
      knowledgePoint: input.knowledgePoint ?? null,
      details: {
        stageType: input.stageType,
        sessionId: input.sessionId,
        ...(typeof input.details === "object" && input.details !== null ? input.details : {}),
      },
    });
  }
}
