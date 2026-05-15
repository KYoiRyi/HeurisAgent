/**
 * Visual language for the three agents — anchored to the cream/coral
 * editorial palette (see DESIGN.md). No purples, no neon — just the
 * warm trinity: teal accent, coral primary, amber companion.
 */
import { BookX, CalendarClock, MessageSquareText, type LucideIcon } from "lucide-react";

export type AgentKey = "classroom" | "errors" | "review";

export interface AgentTheme {
  key: AgentKey;
  name: string;
  tagline: string;
  intro: string;
  icon: LucideIcon;
  /** Solid accent (CSS color value) for badges, dots, sparklines. */
  accent: string;
  /** Soft cream wash applied to the agent's hero card. */
  wash: string;
  /** Token used in `style={{ ['--agent-accent' as string]: theme.accent }}` */
  accentVar: string;
}

export const AGENT_THEMES: Record<AgentKey, AgentTheme> = {
  classroom: {
    key: "classroom",
    name: "课堂智能体",
    tagline: "启发式互动 · 黑板演示 · 即时出题",
    intro: "实时讲解、可交互黑板、即时练习闭环。每一次提问都会沉淀为知识卡片。",
    icon: MessageSquareText,
    accent: "#5db8a6",
    wash: "linear-gradient(135deg, #f4ede1 0%, #e6dfd2 100%)",
    accentVar: "--accent-teal",
  },
  errors: {
    key: "errors",
    name: "错题智能体",
    tagline: "错因诊断 · 同类变形 · 薄弱点画像",
    intro: "自动判别错因类型，沉淀同类变形与靶向训练。共享至复习智能体形成闭环。",
    icon: BookX,
    accent: "#cc785c",
    wash: "linear-gradient(135deg, #f5e9df 0%, #e8d2c2 100%)",
    accentVar: "--coral",
  },
  review: {
    key: "review",
    name: "复习智能体",
    tagline: "记忆曲线 · 优先级排程 · 复盘闭环",
    intro: "根据错题密度与最近练习生成节奏化任务，让每次复习都用在刀刃上。",
    icon: CalendarClock,
    accent: "#e8a55a",
    wash: "linear-gradient(135deg, #f6ecd9 0%, #ecdcb8 100%)",
    accentVar: "--accent-amber",
  },
};

export const AGENT_LIST: AgentTheme[] = [
  AGENT_THEMES.classroom,
  AGENT_THEMES.errors,
  AGENT_THEMES.review,
];
