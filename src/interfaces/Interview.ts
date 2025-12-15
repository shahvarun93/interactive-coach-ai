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
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  persistMessages?: boolean;
  includeTranscript?: boolean;
  contextMessageLimit?: number;
  enableSummarization?: boolean;
  summarizationTriggerCount?: number;
  maxOutputTokens?: number;
}

export interface RunResultDto {
  runId: string;
  assistantText: string;
  usage: {
    tokenInput: number | null;
    tokenOutput: number | null;
    latencyMs: number;
  };
}