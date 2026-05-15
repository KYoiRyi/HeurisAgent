import { Module } from "@nestjs/common";
import { ClassroomHistoryController } from "./classroom-history.controller";
import { ClassroomHistoryService } from "./classroom-history.service";

@Module({
  controllers: [ClassroomHistoryController],
  providers: [ClassroomHistoryService],
  exports: [ClassroomHistoryService],
})
export class ClassroomHistoryModule {}
