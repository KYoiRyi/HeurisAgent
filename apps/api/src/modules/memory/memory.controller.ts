import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { MemoryService } from "./memory.service";

@Controller("memory")
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get()
  async list(
    @Query("limit") limit?: string,
    @Query("source") source?: string,
    @Query("pinned") pinned?: string,
  ) {
    const items = await this.memory.list({
      limit: limit ? Number(limit) : undefined,
      source,
      pinned: pinned === undefined ? undefined : pinned === "true",
    });
    return { items, total: items.length };
  }

  @Get("search")
  async search(
    @Query("q") q: string,
    @Query("limit") limit?: string,
    @Query("subject") subject?: string,
  ) {
    const items = await this.memory.search(q ?? "", limit ? Number(limit) : 20, subject);
    return { items };
  }

  @Get("count")
  async count() {
    return { count: await this.memory.count() };
  }

  @Get(":id")
  async get(@Param("id", ParseIntPipe) id: number) {
    const item = await this.memory.getById(id);
    if (!item) throw new NotFoundException("memory not found");
    return item;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Body()
    body: {
      content: string;
      source?: string;
      tags?: string[];
      importance?: 1 | 2 | 3;
      pinned?: boolean;
      session_id?: string;
    },
  ) {
    return this.memory.add(body.content, {
      source: body.source,
      tags: body.tags,
      importance: body.importance,
      pinned: body.pinned,
      session_id: body.session_id,
    });
  }

  @Patch(":id")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body()
    body: { content?: string; pinned?: boolean; importance?: number; tags?: string[] },
  ) {
    const item = await this.memory.update(id, body);
    if (!item) throw new NotFoundException("memory not found");
    return item;
  }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number) {
    const ok = await this.memory.delete(id);
    return { ok };
  }
}
