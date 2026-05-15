import { Module } from "@nestjs/common";
import { MemoryModule } from "@/modules/memory/memory.module";
import { ResourcesModule } from "@/modules/resources/resources.module";
import { ErrorsModule } from "@/modules/errors/errors.module";
import { ClassroomHistoryModule } from "@/modules/classroom-history/classroom-history.module";
import { ClassroomController } from "./classroom.controller";
import { ClassroomService } from "./classroom.service";

@Module({
  imports: [MemoryModule, ResourcesModule, ErrorsModule, ClassroomHistoryModule],
  controllers: [ClassroomController],
  providers: [ClassroomService],
  exports: [ClassroomService],
})
export class ClassroomModule {}
