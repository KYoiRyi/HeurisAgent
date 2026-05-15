import { Global, Module } from "@nestjs/common";
import { MemoryModule } from "@/modules/memory/memory.module";
import { AgentEventBus } from "./event-bus";
import { AgentRuntimeService } from "./agent-runtime.service";

@Global()
@Module({
  imports: [MemoryModule],
  providers: [AgentEventBus, AgentRuntimeService],
  exports: [AgentEventBus, AgentRuntimeService],
})
export class RuntimeModule {}
