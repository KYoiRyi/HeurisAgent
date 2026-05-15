import { Module } from "@nestjs/common";
import { ClassroomHistoryController } from "./classroom-history.controller";
import { ClassroomHistoryService } from "./classroom-history.service";
import { ClassroomSessionsController } from "./classroom-sessions.controller";
import { ClassroomSessionsService } from "./classroom-sessions.service";

@Module({
  controllers: [ClassroomHistoryController, ClassroomSessionsController],
  providers: [ClassroomHistoryService, ClassroomSessionsService],
  exports: [ClassroomHistoryService, ClassroomSessionsService],
})
export class ClassroomHistoryModule {}
