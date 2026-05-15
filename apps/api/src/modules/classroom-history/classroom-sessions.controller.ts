import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ClassroomSessionsService } from "./classroom-sessions.service";

@Controller("classroom/sessions")
export class ClassroomSessionsController {
  constructor(private readonly sessions: ClassroomSessionsService) {}

  @Get()
  async list(
    @Query("subject") subject?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    const items = await this.sessions.list({
      subject: subject ?? null,
      status: status ?? null,
      limit: limit ? Number(limit) : undefined,
    });
    return { items, total: items.length };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: { title: string; subject: string }) {
    return this.sessions.create(body);
  }

  @Patch(":id/archive")
  async archive(@Param("id") id: string) {
    return this.sessions.archive(id);
  }

  @Patch(":id/title")
  async updateTitle(@Param("id") id: string, @Body() body: { title: string }) {
    await this.sessions.updateTitle(id, body.title);
    return { ok: true };
  }
}
