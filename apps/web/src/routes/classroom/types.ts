export type StageType = "quiz" | "simulation" | "graph" | "lab" | "exercise";

export interface LiveComponent {
  html: string;
  css?: string;
  js?: string;
  description: string;
  stageType?: StageType;
}

export interface ToolCallView {
  name: string;
  args?: unknown;
  isError?: boolean;
}

export interface StageEvent {
  id: string;
  type: string;
  payload: unknown;
  ts: string;
  description?: string;
}

export interface ClassroomRunResponse {
  result: string;
  liveComponents: LiveComponent[];
  toolCalls: ToolCallView[];
  resources: Array<{ id: string; title: string; category: string }>;
  errors: Array<{ id: string; questionText: string; errorType: string | null }>;
  memorySaved: number;
  knowledgePoints: string[];
  scoreFeedback?: ScoreFeedback | null;
}

export interface ScoreFeedback {
  score: number;
  total: number;
  feedback: string;
  correct?: boolean;
}

export interface ArchivedSession {
  sessionId: string;
  subject: string;
  title: string;
  archivedAt: string;
  messageCount: number;
}

export interface RuntimeMessage {
  id: string;
  role: "student" | "agent";
  content: string;
  liveComponent: LiveComponent | null;
  toolCalls: ToolCallView[];
  ts: string;
  knowledgePoints?: string[];
  scoreFeedback?: ScoreFeedback | null;
}

export interface DebugLog {
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
}

export const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "通用"];
export const INTERACTIVE_TAB = "interactive-stage";
