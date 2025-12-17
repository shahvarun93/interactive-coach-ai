export type InterviewMode = "coding" | "system_design";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface SessionRecord {
  id: string;
  status: "active" | "completed" | "archived";
  context_message_limit: number;
  system_prompt: string;
  persist_messages: boolean;
  include_transcript: boolean;
  created_at: string;
  title: string;
  updated_at: string;
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