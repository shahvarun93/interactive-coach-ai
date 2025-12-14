export type InterviewMode = "coding" | "system_design";
export type InterviewPersona = "friendly" | "realistic" | "harsh";
export type Seniority = "mid" | "senior" | "staff";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface SessionRecord {
  id: string;
  modeId: InterviewMode;
  persona: InterviewPersona;
  seniority: Seniority;
  status: "active" | "completed" | "archived";
}

export interface MessageRecord {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  metadataJson?: string | null;
  createdAt: string;
}

export interface RunRequestDto {
  globalSystemPrompt?: string;
  modeSystemPrompt?: string;
  userPrompt: string;
  persistMessages?: boolean;
  includeTranscriptInContext?: boolean;
  contextMessageLimit?: number;
  enableSummarization: boolean;
  summarizationTriggerCount: number;
}

export interface RunResultDto {
  runId: string;
  assistantText: string;
  score: ScorePayload;
  usage: {
    tokenInput: number | null;
    tokenOutput: number | null;
    latencyMs: number;
  };
}

export interface ScorePayload {
  total: number;
  rubric: Record<string, unknown>;
  strengths: string[];
  weaknesses: string[];
  actions: string[];
  followups?: string[];
}