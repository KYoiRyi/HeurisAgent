import { Type, type Static } from "typebox";
import type { AgentTool } from "@/llm/pi-agent/types";
import type { MemoryService } from "@/modules/memory/memory.service";
import type { Database } from "@/persistence/database";
import { cronJobs } from "@/persistence/schema";

const AddMemorySchema = Type.Object({
  content: Type.String({ description: "The content to remember." }),
  tags: Type.Optional(Type.Array(Type.String(), { description: "Topic tags." })),
});

const ScheduleCronJobSchema = Type.Object({
  name: Type.String({ description: "Name of the task." }),
  schedule: Type.String({ description: "When to run, e.g. 'every 2h', 'daily'." }),
  prompt: Type.String({ description: "The instructions for the background task." }),
});

const SearchMemorySchema = Type.Object({
  query: Type.String({ description: "Query to search memories for." }),
  limit: Type.Optional(Type.Number({ description: "Max results, default 8." })),
});

export interface ToolDeps {
  memory: MemoryService;
  db: Database;
  computeNextRun: (schedule: string) => Date;
}

export function buildHeurisTools(deps: ToolDeps): AgentTool[] {
  const addMemoryTool: AgentTool<typeof AddMemorySchema> = {
    name: "add_memory",
    label: "Save Memory",
    description: "Save an important piece of information to long-term memory for future use.",
    parameters: AddMemorySchema,
    execute: async (_id, params: Static<typeof AddMemorySchema>) => {
      await deps.memory.add(params.content, {
        source: "agent_tool",
        importance: 2,
        tags: params.tags ?? [],
      });
      return {
        content: [{ type: "text", text: "Memory saved successfully." }],
        details: { saved: true, content: params.content },
      };
    },
  };

  const scheduleCronJobTool: AgentTool<typeof ScheduleCronJobSchema> = {
    name: "schedule_cron_job",
    label: "Schedule Task",
    description: "Schedule a future background task.",
    parameters: ScheduleCronJobSchema,
    execute: async (_id, params: Static<typeof ScheduleCronJobSchema>) => {
      await deps.db.insert(cronJobs).values({
        name: params.name,
        schedule: params.schedule,
        prompt: params.prompt,
        enabled: true,
        nextRun: deps.computeNextRun(params.schedule),
      });
      return {
        content: [
          { type: "text", text: `Cron job '${params.name}' scheduled for ${params.schedule}.` },
        ],
        details: { scheduled: true, name: params.name, schedule: params.schedule },
      };
    },
  };

  const searchMemoryTool: AgentTool<typeof SearchMemorySchema> = {
    name: "search_memory",
    label: "Search Memory",
    description: "Search long-term memory for relevant context.",
    parameters: SearchMemorySchema,
    execute: async (_id, params: Static<typeof SearchMemorySchema>) => {
      const ctx = await deps.memory.buildContext(params.query, params.limit ?? 8);
      return {
        content: [{ type: "text", text: ctx || "No relevant memories found." }],
        details: { query: params.query, found: !!ctx },
      };
    },
  };

  return [addMemoryTool, scheduleCronJobTool, searchMemoryTool];
}

export function parseScheduleMs(schedule: string): number | null {
  const s = schedule.trim().toLowerCase();
  const everyHour = s.match(/every\s+(\d+)\s*h/);
  if (everyHour) return parseInt(everyHour[1]) * 60 * 60 * 1000;
  const everyMin = s.match(/every\s+(\d+)\s*(min|minute)/);
  if (everyMin) return parseInt(everyMin[1]) * 60 * 1000;
  const everyDay = s.match(/every\s+(\d+)\s*d/);
  if (everyDay) return parseInt(everyDay[1]) * 24 * 60 * 60 * 1000;
  if (s === "daily" || s === "every day") return 24 * 60 * 60 * 1000;
  if (s === "hourly" || s === "every hour") return 60 * 60 * 1000;
  if (s === "every 30 minutes" || s === "every 30min") return 30 * 60 * 1000;
  if (/^[\d\s*/,\-]+$/.test(s)) return 60 * 60 * 1000;
  return null;
}

export function computeNextRun(schedule: string): Date {
  const ms = parseScheduleMs(schedule);
  return new Date(Date.now() + (ms ?? 60 * 60 * 1000));
}
