import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { ClassroomHistoryService } from "./classroom-history.service";

@Controller("classroom/history")
export class ClassroomHistoryController {
  constructor(private readonly history: ClassroomHistoryService) {}

  @Get()
  async list(
    @Query("subject") subject?: string,
    @Query("sessionId") sessionId?: string,
    @Query("limit") limit?: string,
  ) {
    const items = await this.history.list({
      subject: subject ?? null,
      sessionId: sessionId ?? null,
      limit: limit ? Number(limit) : undefined,
    });
    return { items, total: items.length };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Body()
    body: {
      sessionId?: string;
      subject: string;
      role: "student" | "agent";
      content: string;
      messageType?: string;
      knowledgePoints?: string[];
      liveComponent?: Record<string, string> | null;
      toolCalls?: Record<string, unknown>[];
    },
  ) {
    return this.history.add(body);
  }
}
