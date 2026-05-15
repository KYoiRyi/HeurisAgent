import { Type, type Static } from "typebox";
import type { AgentTool } from "@/llm/pi-agent/types";
import type { Database } from "@/persistence/database";
import type { MemoryService } from "@/modules/memory/memory.service";
import type { ResourcesService } from "@/modules/resources/resources.service";
import type { ErrorsService } from "@/modules/errors/errors.service";

const AddMemorySchema = Type.Object({
  content: Type.String({ description: "The content to remember." }),
  tags: Type.Optional(Type.Array(Type.String())),
});

const SearchMemorySchema = Type.Object({
  query: Type.String({ description: "Query to search memories for." }),
  limit: Type.Optional(Type.Number()),
});

const RenderLiveComponentSchema = Type.Object({
  html: Type.String({ description: "The HTML structure of the interactive component" }),
  css: Type.Optional(Type.String({ description: "Vanilla CSS styles" })),
  js: Type.Optional(Type.String({ description: "Vanilla JavaScript with window.HeurisStage.emit(type, payload) callbacks" })),
  description: Type.String({ description: "A brief description of the component" }),
  stageType: Type.Optional(Type.Union([
    Type.Literal("quiz"),
    Type.Literal("simulation"),
    Type.Literal("graph"),
    Type.Literal("lab"),
    Type.Literal("exercise"),
  ], { description: "Type of stage: quiz (选择/填空), simulation (物理/化学模拟), graph (图表/函数), lab (虚拟实验), exercise (综合练习)" })),
});

const SaveResourceSchema = Type.Object({
  title: Type.String(),
  content: Type.String(),
  subject: Type.String(),
  tags: Type.Array(Type.String()),
  category: Type.Optional(
    Type.String({ description: "Use 'knowledge-point' for facts, 'exercise' for questions." }),
  ),
});

const SaveErrorSchema = Type.Object({
  student_name: Type.String(),
  subject: Type.String(),
  question_text: Type.String(),
  student_answer: Type.Optional(Type.String()),
  error_type: Type.String({ description: "concept, calculation, careless, method" }),
  error_analysis: Type.String(),
});

export interface ClassroomToolDeps {
  memory: MemoryService;
  resources: ResourcesService;
  errors: ErrorsService;
  db: Database;
  studentName?: string;
  sessionId?: string;
  subject?: string;
}

export function buildClassroomTools(deps: ClassroomToolDeps): AgentTool[] {
  const addMemoryTool: AgentTool<typeof AddMemorySchema> = {
    name: "add_memory",
    label: "Add Memory",
    description: "Save important long-term facts or context.",
    parameters: AddMemorySchema,
    execute: async (_id, params: Static<typeof AddMemorySchema>) => {
      const studentPrefix = deps.studentName ? `学生${deps.studentName}：` : "";
      const savedContent = `${studentPrefix}${params.content}`;
      await deps.memory.add(savedContent, {
        source: "classroom",
        importance: 2,
        session_id: deps.sessionId,
        tags: [
          ...(params.tags ?? []),
          ...(deps.studentName ? [`student:${deps.studentName}`] : []),
          ...(deps.subject ? [`subject:${deps.subject}`] : []),
        ],
      });
      return {
        content: [{ type: "text", text: "Memory saved successfully." }],
        details: { saved: true, content: savedContent },
      };
    },
  };

  const searchMemoryTool: AgentTool<typeof SearchMemorySchema> = {
    name: "search_memory",
    label: "Search Memory",
    description: "Search long-term memory for relevant context.",
    parameters: SearchMemorySchema,
    execute: async (_id, params: Static<typeof SearchMemorySchema>) => {
      const ctx = await deps.memory.buildContext(params.query, params.limit ?? 8, deps.subject);
      return {
        content: [{ type: "text", text: ctx || "No relevant memories found." }],
        details: { query: params.query, found: !!ctx },
      };
    },
  };

  const renderLiveComponent: AgentTool<typeof RenderLiveComponentSchema> = {
    name: "render_live_component",
    label: "Render Live Component",
    description:
      "Render a live interactive UI component on the student's stage (HTML/CSS/vanilla JS). Use for simulations, quizzes, graphs, labs. JS should call window.HeurisStage.emit(type, payload) so future turns can read student answers.",
    parameters: RenderLiveComponentSchema,
    execute: async (_id, params: Static<typeof RenderLiveComponentSchema>) => {
      // Frontend handles actual rendering by parsing the tool call from the SSE stream.
      return {
        content: [{ type: "text", text: "Component has been rendered on the student's stage." }],
        details: params,
      };
    },
  };

  const saveResourceTool: AgentTool<typeof SaveResourceSchema> = {
    name: "save_learning_resource",
    label: "Save Learning Resource",
    description:
      "Save a structured knowledge-point resource or exercise to the class database. Use 'knowledge-point' for facts/concepts. Use 'exercise' for questions/tests. Do not save plain chat transcripts.",
    parameters: SaveResourceSchema,
    execute: async (_id, params: Static<typeof SaveResourceSchema>) => {
      const cat = params.category === "exercise" ? "exercise" : "knowledge-point";
      if (!isKnowledgeResource(params)) {
        return {
          content: [{ type: "text", text: "Skipped resource save: no concrete knowledge point detected." }],
          details: { saved: false, skipped: true, reason: "missing_knowledge_point", title: params.title },
        };
      }
      const resource = await deps.resources.add({
        title: params.title,
        content: params.content,
        subject: params.subject,
        category: cat,
        tags: [cat, ...params.tags],
        created_by: "classroom_agent",
      });
      return {
        content: [{ type: "text", text: `Saved learning resource: ${params.title}` }],
        details: { ...resource, saved: true },
      };
    },
  };

  const saveErrorTool: AgentTool<typeof SaveErrorSchema> = {
    name: "save_error_question",
    label: "Save Error Question",
    description: "Proactively record a student's mistake to the error database for future review.",
    parameters: SaveErrorSchema,
    execute: async (_id, params: Static<typeof SaveErrorSchema>) => {
      const saved = await deps.errors.add({
        student_name: params.student_name,
        subject: params.subject,
        question_text: params.question_text,
        student_answer: params.student_answer,
        error_type: params.error_type,
        error_analysis: params.error_analysis,
        session_id: deps.sessionId,
      });

      await deps.memory.add(
        [
          "[错题记录]",
          `学生：${params.student_name}`,
          `学科：${params.subject}`,
          `题目：${params.question_text}`,
          params.student_answer ? `学生答案：${params.student_answer}` : "",
          `错误类型：${params.error_type}`,
          `错因分析：${params.error_analysis}`,
        ]
          .filter(Boolean)
          .join("\n"),
        {
          source: "error",
          importance: 3,
          session_id: deps.sessionId,
          tags: [
            "error-question",
            "weakness",
            `subject:${params.subject}`,
            `student:${params.student_name}`,
          ],
        },
      );

      return {
        content: [{ type: "text", text: `Logged error record for ${params.student_name}` }],
        details: { saved: true, ...saved },
      };
    },
  };

  return [renderLiveComponent, searchMemoryTool, addMemoryTool, saveResourceTool, saveErrorTool];
}

function isKnowledgeResource(params: {
  title: string;
  content: string;
  tags: string[];
  category?: string;
}): boolean {
  if (params.category === "exercise") return true;
  const combined = `${params.title}\n${params.content}\n${params.tags.join(" ")}`;
  return /知识点|概念|定律|公式|原理|规则|方法|模型|例题|实验|结论|误区|错因|法则|单位|性质|推导|题|练|考|knowledge|concept|formula|law|principle/i.test(
    combined,
  );
}
