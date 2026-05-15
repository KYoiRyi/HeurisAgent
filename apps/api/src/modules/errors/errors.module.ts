import { Module } from "@nestjs/common";
import { LlmModule } from "@/modules/llm/llm.module";
import { ErrorsController } from "./errors.controller";
import { ErrorsService } from "./errors.service";
import { ErrorsAnalysisService } from "./errors-analysis.service";

@Module({
  imports: [LlmModule],
  controllers: [ErrorsController],
  providers: [ErrorsService, ErrorsAnalysisService],
  exports: [ErrorsService, ErrorsAnalysisService],
})
export class ErrorsModule {}
