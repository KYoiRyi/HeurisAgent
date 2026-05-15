import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ReviewService } from "./review.service";
import { ReviewPlanningService } from "./review-planning.service";

@Controller("review")
export class ReviewController {
  constructor(
    private readonly review: ReviewService,
    private readonly planning: ReviewPlanningService,
  ) {}

  @Get()
  async list(
    @Query("subject") subject?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    const items = await this.review.list({
      subject: subject ?? null,
      status: status ?? null,
      limit: limit ? Number(limit) : undefined,
    });
    return { items, total: items.length };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const item = await this.review.getById(id);
    if (!item) throw new NotFoundException("review plan not found");
    return item;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async save(
    @Body()
    body: {
      studentName: string;
      subject: string;
      planData: Record<string, unknown>;
      totalTasks: number;
    },
  ) {
    return this.review.saveActive(body);
  }

  @Post("generate")
  @HttpCode(HttpStatus.OK)
  async generate(
    @Body()
    body: { studentName?: string; subject: string; durationDays?: number; notes?: string },
  ) {
    return this.planning.generate(body);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body()
    body: { completed_tasks?: number; schedule?: unknown[]; status?: string },
  ) {
    const item = await this.review.update(id, body);
    if (!item) throw new NotFoundException("review plan not found");
    return item;
  }
}
