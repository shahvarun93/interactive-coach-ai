// src/interfaces/InterviewOrchestrator.ts
import { ChatMessage } from "./Chat";
import { RunRequestDto } from "./Interview";

export interface MessageWithRoleAndContent {
  role: string;
  content: string;
}

export interface TrimMessagesToInputBudgetParams {
  summaryMsg: ChatMessage[];
  systemMsgs: ChatMessage[];
  transcriptMsgs: ChatMessage[];
  nonSystemMsgs: ChatMessage[];
  maxInputTokens: number;
}

export interface BuildEffectiveTokenBudgetParams {
  summaryMsg: ChatMessage[];
  systemMsgs: ChatMessage[];
  transcriptMsgs: ChatMessage[];
  nonSystemMsgs: ChatMessage[];
}

export interface CreateSessionParams {
  title?: string;
  systemPrompt?: string | null;
  contextMessageLimit?: number | null;
  maxOutputTokens?: number | null;
  includeTranscript?: boolean | null;
  persistMessages?: boolean | null;
}

export interface GetSessionParams {
  sessionId: string;
  includeTranscript?: boolean;
  limit?: number;
}

export interface GetSessionMessagesParams {
  sessionId: string;
  limit?: number;
}

export interface ListSessionsParams {
  limit?: number;
  cursorUpdatedAt?: string | null;
  cursorId?: string | null;
}

export interface DeleteSessionParams {
  sessionId: string;
}

export interface StreamTurnParams {
  sessionId: string;
  dto: RunRequestDto;
}

export interface RunTurnParams {
  sessionId: string;
  dto: RunRequestDto;
}

export interface UpdateSessionSummaryParams {
  sessionId: string;
  triggerCount: number;
  sliceLimit: number;
}

export interface StreamTurnResult {
  runId: string;
  stream: AsyncGenerator<string, void, void>;
  finalize: (fullText: string) => Promise<{
    runId: string;
    assistantText: string;
    latencyMs: number;
  }>;
}

