import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ClassroomService } from "./classroom.service";

@Controller("classroom")
export class ClassroomController {
  constructor(private readonly classroom: ClassroomService) {}

  @Post("run")
  @HttpCode(HttpStatus.OK)
  async run(
    @Body()
    body: {
      prompt: string;
      subject?: string;
      studentName?: string;
      sessionId?: string;
      stageEvents?: Array<{ type: string; payload?: unknown; description?: string }>;
      activeStage?: { description: string } | null;
    },
  ) {
    return this.classroom.runTurn(body);
  }
}
