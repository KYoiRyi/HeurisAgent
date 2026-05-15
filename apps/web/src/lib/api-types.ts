export interface MemoryItem {
  id: number;
  content: string;
  source: string;
  tags: string[];
  importance: number;
  pinned: boolean;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryListResponse {
  items: MemoryItem[];
  total: number;
}

export interface ResourceItem {
  id: string;
  title: string;
  subject: string;
  category: string;
  content: string | null;
  file_url: string | null;
  tags: string[];
  difficulty: string;
  created_by: string;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
  storage: "local";
}

export interface ResourceListResponse {
  items: ResourceItem[];
  total: number;
}

export interface ReviewPlan {
  id: string;
  student_name: string;
  subject: string;
  plan_title: string;
  plan_content: string;
  blind_spots: string[];
  schedule: Array<{ day: string; tasks: string[]; duration_minutes: number }>;
  priority_topics: Array<{ topic: string; priority: string; reason: string }>;
  review_strategy: string | null;
  progress: number;
  total_tasks: number;
  completed_tasks: number;
  status: string;
  created_at: string;
}

export interface ReviewListResponse {
  items: ReviewPlan[];
  total: number;
}

export interface ClassroomMessage {
  id: string;
  session_id: string | null;
  subject: string;
  role: "student" | "agent";
  content: string;
  message_type: string;
  related_knowledge_points: string[];
  live_component: Record<string, string> | null;
  live_components?: unknown[];
  stage_type?: string | null;
  tool_calls: Record<string, unknown>[];
  created_at: string;
}

export interface ClassroomHistoryResponse {
  items: ClassroomMessage[];
  total: number;
}

export interface SettingsValue {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  resolvedBaseUrl: string;
  resolvedApi: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
}

export interface AgentStatus {
  running: boolean;
  jobCount: number;
  runningTasks: number;
  memoryCount: number;
  recentRuns: Array<{
    id: number;
    job_id: number | null;
    trigger: string;
    prompt: string;
    result: string | null;
    status: string;
    started_at: string;
    finished_at: string | null;
    tokens_used: number;
  }>;
}

export interface CronJob {
  id: number;
  name: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  runCount: number;
  createdAt: string;
}

export interface AgentEvent {
  type:
    | "task_start"
    | "task_done"
    | "task_error"
    | "status"
    | "tool_start"
    | "tool_end"
    | "stream_chunk";
  payload: Record<string, unknown>;
  ts: string;
}

export interface LlmHealth {
  ok: boolean;
  models?: string[];
  error?: string;
  baseUrl?: string;
  model?: string;
  provider?: string;
}

export interface ErrorQuestion {
  id: string;
  student_name: string;
  subject: string;
  question_text: string;
  student_answer: string | null;
  correct_answer: string | null;
  error_type: string | null;
  error_analysis: string | null;
  knowledge_points: string[];
  difficulty: string;
  similar_questions: unknown[];
  reinforcement_suggestions: string | null;
  status: string;
  review_count: number;
  mastered: boolean;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ErrorListResponse {
  items: ErrorQuestion[];
  total: number;
}

export interface ErrorStats {
  total: number;
  mastered: number;
  byType: Array<{ errorType: string; count: number }>;
  bySubject: Array<{ subject: string; count: number }>;
}
