import { Module } from "@nestjs/common";
import { LlmModule } from "@/modules/llm/llm.module";
import { ErrorsModule } from "@/modules/errors/errors.module";
import { MemoryModule } from "@/modules/memory/memory.module";
import { ReviewController } from "./review.controller";
import { ReviewService } from "./review.service";
import { ReviewPlanningService } from "./review-planning.service";

@Module({
  imports: [LlmModule, ErrorsModule, MemoryModule],
  controllers: [ReviewController],
  providers: [ReviewService, ReviewPlanningService],
  exports: [ReviewService, ReviewPlanningService],
})
export class ReviewModule {}
