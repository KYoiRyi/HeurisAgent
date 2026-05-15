import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ErrorsService } from "./errors.service";
import { ErrorsAnalysisService } from "./errors-analysis.service";

@Controller("errors")
export class ErrorsController {
  constructor(
    private readonly errors: ErrorsService,
    private readonly analysis: ErrorsAnalysisService,
  ) {}

  @Get()
  async list(
    @Query("subject") subject?: string,
    @Query("studentName") studentName?: string,
    @Query("errorType") errorType?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    const items = await this.errors.list({
      subject: subject ?? null,
      studentName: studentName ?? null,
      errorType: errorType ?? null,
      status: status ?? null,
      limit: limit ? Number(limit) : undefined,
    });
    return { items, total: items.length };
  }

  @Get("stats")
  async stats(
    @Query("subject") subject?: string,
    @Query("studentName") studentName?: string,
  ) {
    return this.errors.stats({
      subject: subject ?? undefined,
      studentName: studentName ?? undefined,
    });
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const item = await this.errors.getById(id);
    if (!item) throw new NotFoundException("error question not found");
    return item;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Body()
    body: {
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
    },
  ) {
    return this.errors.add(body);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body()
    body: {
      status?: string;
      mastered?: boolean;
      reinforcement_suggestions?: string;
      similar_questions?: unknown[];
      review_count_delta?: number;
    },
  ) {
    const item = await this.errors.update(id, body);
    if (!item) throw new NotFoundException("error question not found");
    return item;
  }

  @Post(":id/variants")
  @HttpCode(HttpStatus.OK)
  async variants(@Param("id") id: string, @Body() body: { count?: number }) {
    return this.analysis.generateVariants(id, body?.count ?? 3);
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    const ok = await this.errors.delete(id);
    return { ok };
  }
}
