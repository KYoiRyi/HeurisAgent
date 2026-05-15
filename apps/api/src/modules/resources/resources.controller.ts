import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ResourcesService } from "./resources.service";

@Controller("resources")
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  async list(
    @Query("subject") subject?: string,
    @Query("category") category?: string,
    @Query("difficulty") difficulty?: string,
    @Query("limit") limit?: string,
  ) {
    const items = await this.resources.list({
      subject: subject ?? null,
      category: category ?? null,
      difficulty: difficulty ?? null,
      limit: limit ? Number(limit) : undefined,
    });
    return { items, total: items.length };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const item = await this.resources.getById(id);
    if (!item) throw new NotFoundException("resource not found");
    return item;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Body()
    body: {
      title: string;
      subject: string;
      category?: string;
      content?: string | null;
      file_url?: string | null;
      tags?: string[];
      difficulty?: string;
      created_by?: string;
      is_shared?: boolean;
    },
  ) {
    return this.resources.add(body);
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    const ok = await this.resources.delete(id);
    return { ok };
  }
}
