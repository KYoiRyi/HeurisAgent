import { Injectable, Logger } from "@nestjs/common";
import { LlmService } from "@/modules/llm/llm.service";
import { ErrorsService, type ErrorQuestionDto } from "./errors.service";

export interface VariantQuestion {
  question_text: string;
  difficulty: "easy" | "medium" | "hard";
  knowledge_points: string[];
  hint?: string;
  answer?: string;
}

@Injectable()
export class ErrorsAnalysisService {
  private readonly logger = new Logger(ErrorsAnalysisService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly errors: ErrorsService,
  ) {}

  async generateVariants(id: string, count = 3): Promise<ErrorQuestionDto> {
    const target = await this.errors.getById(id);
    if (!target) throw new Error("error question not found");

    const systemPrompt = [
      "你是 HeurisAgent 错题智能体的同类变形生成器。",
      "基于一道做错的题目，生成同知识点、不同情境/数值的若干变形题。",
      "必须只输出一个合法 JSON 对象（顶层无任何 markdown 代码块包裹），结构如下：",
      `{
  "variants": [
    {
      "question_text": "题干",
      "difficulty": "easy|medium|hard",
      "knowledge_points": ["..."],
      "hint": "提示（可选）",
      "answer": "参考答案"
    }
  ],
  "reinforcement_suggestions": "针对该错因的强化练习建议"
}`,
      `生成 ${count} 道变形题。难度阶梯：第一道 easy，最后一道 hard。`,
      "题目要紧扣错因（concept/calculation/careless/method）的薄弱点，不要换汤不换药。",
    ].join("\n");

    const userPrompt = [
      `学科：${target.subject}`,
      `错因类别：${target.error_type ?? "未分类"}`,
      `原题：${target.question_text}`,
      target.student_answer ? `学生答案：${target.student_answer}` : "",
      target.correct_answer ? `参考答案：${target.correct_answer}` : "",
      target.error_analysis ? `错因分析：${target.error_analysis}` : "",
      target.knowledge_points.length ? `相关知识点：${target.knowledge_points.join("、")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await this.llm.invoke(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.6, max_tokens: 1800 },
    );

    const parsed = parseJsonLoose(response.content);
    if (!parsed?.variants?.length) {
      this.logger.warn(`failed to parse variants JSON: ${response.content.substring(0, 200)}`);
      throw new Error("LLM 返回不是合法 JSON 或没有变形题，请重试");
    }

    const updated = await this.errors.update(id, {
      similar_questions: parsed.variants,
      reinforcement_suggestions: parsed.reinforcement_suggestions ?? target.reinforcement_suggestions ?? undefined,
    });
    if (!updated) throw new Error("failed to persist variants");
    return updated;
  }
}

function parseJsonLoose(text: string): { variants?: VariantQuestion[]; reinforcement_suggestions?: string } | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
