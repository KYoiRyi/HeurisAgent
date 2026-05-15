import { Injectable, Logger } from "@nestjs/common";
import { LlmService } from "@/modules/llm/llm.service";
import { ErrorsService } from "@/modules/errors/errors.service";
import { MemoryService } from "@/modules/memory/memory.service";
import { ReviewService, type LocalReviewPlan } from "./review.service";

export interface GeneratePlanInput {
  studentName?: string;
  subject: string;
  durationDays?: number;
  notes?: string;
}

interface ParsedPlan {
  plan_title?: string;
  plan_content?: string;
  blind_spots?: string[];
  schedule?: Array<{ day: string; tasks: string[]; duration_minutes: number }>;
  priority_topics?: Array<{ topic: string; priority: string; reason: string }>;
  review_strategy?: string;
}

@Injectable()
export class ReviewPlanningService {
  private readonly logger = new Logger(ReviewPlanningService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly errors: ErrorsService,
    private readonly memory: MemoryService,
    private readonly review: ReviewService,
  ) {}

  async generate(input: GeneratePlanInput): Promise<LocalReviewPlan> {
    const subject = input.subject.trim();
    const studentName = input.studentName?.trim() || "默认学习者";
    const days = input.durationDays ?? 7;

    const [stats, recentErrors, memCtx] = await Promise.all([
      this.errors.stats({ subject, studentName }),
      this.errors.list({ subject, studentName, limit: 30 }),
      this.memory.buildContext(`${subject} 复习重点`, 8, subject),
    ]);

    const errorSummary = recentErrors
      .slice(0, 12)
      .map(
        (e) =>
          `- [${e.error_type ?? "未分类"}] ${truncate(e.question_text, 80)} ${
            e.error_analysis ? `（${truncate(e.error_analysis, 60)}）` : ""
          }`,
      )
      .join("\n");

    const typeBreakdown = stats.byType.map((t) => `${t.errorType}:${t.count}`).join(", ") || "暂无";

    const systemPrompt = [
      "你是 HeurisAgent 复习策略智能体。基于学生错题画像与记忆，生成节奏化的复习计划。",
      "必须只输出一个合法 JSON 对象（顶层无任何 markdown 代码块包裹），字段如下：",
      `{
  "plan_title": "string",
  "plan_content": "string，整体计划说明",
  "blind_spots": ["盲点1", "盲点2"],
  "priority_topics": [{ "topic": "...", "priority": "high|medium|low", "reason": "..." }],
  "schedule": [{ "day": "Day 1", "tasks": ["任务1", "任务2"], "duration_minutes": 60 }],
  "review_strategy": "string"
}`,
      `计划周期：${days} 天，schedule 数组长度应为 ${days}。`,
      "tasks 中每条要具体到知识点或题型，不要泛泛而谈。",
      "如果错题样本不足，要从学科常见考点切入，并在 review_strategy 中说明数据局限。",
    ].join("\n");

    const userPrompt = [
      `学生：${studentName}`,
      `学科：${subject}`,
      `错题总数：${stats.total}（已掌握 ${stats.mastered}）`,
      `错因分布：${typeBreakdown}`,
      "",
      "近期错题样本：",
      errorSummary || "（暂无）",
      "",
      memCtx ? `记忆上下文：\n${memCtx}` : "",
      input.notes ? `\n附加说明：${input.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await this.llm.invoke(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.4, max_tokens: 2400 },
    );

    const parsed = parseJsonLoose(response.content);
    if (!parsed) {
      this.logger.warn(`failed to parse plan JSON: ${response.content.substring(0, 200)}`);
      throw new Error("LLM 返回不是合法 JSON，请重试或减少错题样本量");
    }

    const totalTasks = (parsed.schedule ?? []).reduce(
      (sum, day) => sum + (Array.isArray(day.tasks) ? day.tasks.length : 0),
      0,
    );

    return this.review.saveActive({
      studentName,
      subject,
      planData: parsed as Record<string, unknown>,
      totalTasks,
    });
  }
}

function truncate(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

function parseJsonLoose(text: string): ParsedPlan | null {
  const trimmed = text.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(stripped) as ParsedPlan;
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1)) as ParsedPlan;
      } catch {
        return null;
      }
    }
    return null;
  }
}
