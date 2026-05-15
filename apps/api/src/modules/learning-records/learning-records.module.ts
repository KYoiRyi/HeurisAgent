import { Module } from "@nestjs/common";
import { LearningRecordsService } from "./learning-records.service";

@Module({
  providers: [LearningRecordsService],
  exports: [LearningRecordsService],
})
export class LearningRecordsModule {}
