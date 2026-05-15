import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Sse,
} from "@nestjs/common";
import { map, type Observable } from "rxjs";
import { AgentRuntimeService } from "../../runtime/agent-runtime.service";
import { AgentEventBus } from "../../runtime/event-bus";

@Controller("agent")
export class AgentController {
  constructor(
    private readonly runtime: AgentRuntimeService,
    private readonly events: AgentEventBus,
  ) {}

  @Get("status")
  async status() {
    return this.runtime.status();
  }

  @Sse("events")
  events$(): Observable<MessageEvent> {
    return this.events.asObservable().pipe(map((event) => ({ data: event })));
  }

  @Post("run")
  @HttpCode(HttpStatus.OK)
  async run(@Body() body: { prompt: string; trigger?: string }) {
    const result = await this.runtime.runTask(body.prompt, {
      trigger: body.trigger ?? "manual",
    });
    return { result };
  }

  @Get("tasks")
  async tasks(@Query("limit") limit?: string) {
    const items = await this.runtime.listTaskRuns(limit ? Number(limit) : 50);
    return { items };
  }

  @Get("cron")
  async cron() {
    const items = await this.runtime.listCronJobs();
    return { items };
  }

  @Post("cron")
  @HttpCode(HttpStatus.CREATED)
  async createCron(
    @Body() body: { name: string; schedule: string; prompt: string; enabled?: boolean },
  ) {
    return this.runtime.createCronJob(body);
  }

  @Patch("cron/:id")
  async toggleCron(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { enabled: boolean },
  ) {
    const row = await this.runtime.toggleCronJob(id, body.enabled);
    if (!row) throw new NotFoundException("cron job not found");
    return row;
  }

  @Delete("cron/:id")
  async deleteCron(@Param("id", ParseIntPipe) id: number) {
    const ok = await this.runtime.deleteCronJob(id);
    return { ok };
  }
}
