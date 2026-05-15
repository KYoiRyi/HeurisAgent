import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import path from "node:path";
import fs from "node:fs";
import { PersistenceModule } from "./persistence/persistence.module";
import { RuntimeModule } from "./runtime/runtime.module";
import { HealthModule } from "./modules/health/health.module";
import { AgentModule } from "./modules/agent/agent.module";
import { MemoryModule } from "./modules/memory/memory.module";
import { ResourcesModule } from "./modules/resources/resources.module";
import { ClassroomHistoryModule } from "./modules/classroom-history/classroom-history.module";
import { ClassroomModule } from "./modules/classroom/classroom.module";
import { ReviewModule } from "./modules/review/review.module";
import { ErrorsModule } from "./modules/errors/errors.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { LlmModule } from "./modules/llm/llm.module";

const webDist = path.resolve(__dirname, "..", "..", "web", "dist");

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PersistenceModule,
    SettingsModule,
    LlmModule,
    MemoryModule,
    ResourcesModule,
    ClassroomHistoryModule,
    ReviewModule,
    ErrorsModule,
    RuntimeModule,
    HealthModule,
    AgentModule,
    ClassroomModule,
    ...(fs.existsSync(webDist)
      ? [
          ServeStaticModule.forRoot({
            rootPath: webDist,
            exclude: ["/api/(.*)"],
          }),
        ]
      : []),
  ],
})
export class AppModule {}
