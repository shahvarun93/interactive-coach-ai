import { RunRequestDto, RunResultDto } from "../interfaces/Interview";
import type { ChatMessage } from "../interfaces/Chat";
import * as interviewDao from "../dao/interview.dao";
import * as promptBuilder from "./interviewPromptBuilder-ai.service";
import * as summarizerAi from "./interviewSummarizer-ai.service";

const CONTEXT_WINDOW_TOKENS = Number(process.env.OPENAI_CONTEXT_WINDOW_TOKENS ?? 128000);
const TOKEN_SAFETY_MARGIN = Number(process.env.OPENAI_TOKEN_SAFETY_MARGIN ?? 512);
const MAX_USER_CHARS = Number(process.env.OPENAI_MAX_USER_CHARS ?? 12000);

function estimateTokens(messages: Array<{ role: string; content: string }>): number {
  const chars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
  return Math.ceil(chars / 4) + messages.length * 8;
}

function trimMessagesToInputBudget(params: {
  summaryMsg: ChatMessage[];
  systemMsgs: ChatMessage[];
  transcriptMsgs: ChatMessage[];
  nonSystemMsgs: ChatMessage[];
  maxInputTokens: number;
}): { messages: ChatMessage[]; requestLogMessages: ChatMessage[] } {
  const summaryMsg = params.summaryMsg ?? [];
  const systemMsgs = params.systemMsgs ?? [];
  let transcriptMsgs = [...(params.transcriptMsgs ?? [])];
  let nonSystemMsgs = [...(params.nonSystemMsgs ?? [])];

  const buildAll = () => [...summaryMsg, ...systemMsgs, ...transcriptMsgs, ...nonSystemMsgs];
  const buildLog = () => [...summaryMsg, ...transcriptMsgs, ...nonSystemMsgs];

  while (estimateTokens(buildAll()) > params.maxInputTokens && transcriptMsgs.length > 0) {
    transcriptMsgs.shift();
  }

  while (estimateTokens(buildAll()) > params.maxInputTokens && nonSystemMsgs.length > 1) {
    nonSystemMsgs.shift();
  }

  if (nonSystemMsgs.length > 0) {
    const lastIdx = nonSystemMsgs.length - 1;
    const last = nonSystemMsgs[lastIdx];
    const c = String(last.content ?? "");
    if (c.length > MAX_USER_CHARS) {
      nonSystemMsgs[lastIdx] = { ...last, content: c.slice(c.length - MAX_USER_CHARS) };
    }
  }

  if (estimateTokens(buildAll()) > params.maxInputTokens) {
    throw new Error("Context too large for token budget. Reduce history or output tokens.");
  }

  return { messages: buildAll(), requestLogMessages: buildLog() };
}

function clampInt(n: unknown, min: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

function buildEffectiveTokenBudget(params: {
  summaryMsg: ChatMessage[];
  systemMsgs: ChatMessage[];
  transcriptMsgs: ChatMessage[];
  nonSystemMsgs: ChatMessage[];
}): {
  maxOutputTokens: number;
  maxInputTokens: number;
  messages: ChatMessage[];
  requestLogMessages: ChatMessage[];
} {
  // Conservative defaults; can be overridden via env if needed.
  const MIN_OUT = Number(process.env.OPENAI_MIN_OUTPUT_TOKENS ?? 512);
  const MAX_OUT = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? 8192);
  const DEFAULT_OUT_TARGET = Number(process.env.OPENAI_DEFAULT_OUTPUT_TOKENS ?? 4096);

  // Phase 1: assume an initial output target so we can trim input.
  let maxOut = clampInt(DEFAULT_OUT_TARGET, MIN_OUT, MAX_OUT);

  // Trim input to fit (context - maxOut - safety)
  let maxIn = Math.max(256, CONTEXT_WINDOW_TOKENS - maxOut - TOKEN_SAFETY_MARGIN);
  let trimmed = trimMessagesToInputBudget({
    summaryMsg: params.summaryMsg,
    systemMsgs: params.systemMsgs,
    transcriptMsgs: params.transcriptMsgs,
    nonSystemMsgs: params.nonSystemMsgs,
    maxInputTokens: maxIn,
  });

  // Phase 2: compute remaining output budget after trimming input.
  const estIn = estimateTokens(trimmed.messages);
  const remaining = Math.max(256, CONTEXT_WINDOW_TOKENS - estIn - TOKEN_SAFETY_MARGIN);

  // Choose output tokens as min(remaining, MAX_OUT), but never below MIN_OUT.
  // Also: don't exceed remaining.
  maxOut = clampInt(Math.min(remaining, MAX_OUT), MIN_OUT, MAX_OUT);

  // Re-trim with updated output (usually no-op, but keeps correctness).
  maxIn = Math.max(256, CONTEXT_WINDOW_TOKENS - maxOut - TOKEN_SAFETY_MARGIN);
  trimmed = trimMessagesToInputBudget({
    summaryMsg: params.summaryMsg,
    systemMsgs: params.systemMsgs,
    transcriptMsgs: params.transcriptMsgs,
    nonSystemMsgs: params.nonSystemMsgs,
    maxInputTokens: maxIn,
  });

  return {
    maxOutputTokens: maxOut,
    maxInputTokens: maxIn,
    messages: trimmed.messages,
    requestLogMessages: trimmed.requestLogMessages,
  };
}


export async function createSession(params: {
  title?: string;
  systemPrompt?: string | null;
  contextMessageLimit?: number | null;
  maxOutputTokens?: number | null;
  includeTranscript?: boolean | null;
  persistMessages?: boolean | null;
}): Promise<{ sessionId: string }> {
  const sessionId = await interviewDao.insertSession({
    title: params.title,
    systemPrompt: params.systemPrompt ?? null,
    contextMessageLimit: params.contextMessageLimit ?? null,
    includeTranscript: params.includeTranscript ?? null,
    persistMessages: params.persistMessages ?? null,
  });
  return { sessionId };
}

export async function getSession(params: {
  sessionId: string;
  includeTranscript?: boolean;
  limit?: number;
}): Promise<any> {
  const session = await interviewDao.getSessionById(params.sessionId);
  if (!session) throw new Error("Session not found");

  const includeTranscript = params.includeTranscript !== false;
  const limit = Math.min(60, Math.max(0, Number(params.limit ?? 20)));

  const toChat = (m: any): ChatMessage => ({
    role: m.role as "user" | "assistant",
    content: String(m.content ?? ""),
  });

  const transcript = includeTranscript
    ? (await interviewDao.listRecentTranscript(params.sessionId, limit)).map(toChat)
    : undefined;

    return {
      sessionId: String(session.id ?? params.sessionId),
      title: session.title ?? null,
      status: session.status ?? null,
      createdAt: session.created_at ?? null,
      updatedAt: session.updated_at ?? null,
      systemPrompt: session.system_prompt ?? null,
      contextMessageLimit: session.context_message_limit ?? null,
      includeTranscriptDefault: session.include_transcript ?? null,
      persistMessagesDefault: session.persist_messages ?? null,
  
      ...(includeTranscript ? { transcript } : {}),
    };
}

export async function getSessionMessages(params: {
  sessionId: string;
  limit?: number;
}): Promise<ChatMessage[]> {
  const session = await interviewDao.getSessionById(params.sessionId);
  if (!session) throw new Error("Session not found");

  const limit = Math.min(60, Math.max(0, Number(params.limit ?? 20)));

  const toChat = (m: any): ChatMessage => ({
    role: m.role as "user" | "assistant",
    content: String(m.content ?? ""),
  });

  const transcript = await interviewDao.listRecentTranscript(params.sessionId, limit);
  return transcript.map(toChat);
}

export async function listSessions(params: {
  limit?: number;
  cursorUpdatedAt?: string | null;
  cursorId?: string | null;
}): Promise<{
  sessions: Array<{
    sessionId: string;
    title: string | null;
    updatedAt: string | null;
    messageCount: number;
  }>;
  nextCursor: { updatedAt: string; id: string } | null;
}> {
  return interviewDao.listSessions({
    limit: params.limit,
    cursorUpdatedAt: params.cursorUpdatedAt ?? null,
    cursorId: params.cursorId ?? null,
  });
}

export async function deleteSession(params: {
  sessionId: string;
}): Promise<{ deleted: boolean }> {
  const session = await interviewDao.getSessionById(params.sessionId);
  if (!session) throw new Error("Session not found");
  return interviewDao.deleteSession(params.sessionId);
}

export async function streamTurn({
  sessionId,
  dto,
}: {
  sessionId: string;
  dto: RunRequestDto;
}): Promise<{
  runId: string;
  stream: AsyncGenerator<string, void, void>;
  finalize: (fullText: string) => Promise<{
    runId: string;
    assistantText: string;
    latencyMs: number;
  }>;
}> {
  const startMs = Date.now();

  const session = await interviewDao.getSessionById(sessionId);
  if (!session) throw new Error("Session not found");

  const sessionSystem = String(session.system_prompt ?? "").trim();

  const persistMessages =
    typeof dto.persistMessages === "boolean"
      ? dto.persistMessages
      : typeof session.persist_messages === "boolean"
      ? session.persist_messages
      : true;

  const includeTranscript =
    typeof dto.includeTranscript === "boolean"
      ? dto.includeTranscript
      : typeof session.include_transcript === "boolean"
      ? session.include_transcript
      : true;

  const contextLimit = Math.min(
    60,
    Math.max(
      0,
      Number(
        dto.contextMessageLimit ?? session.context_message_limit ?? 20
      )
    )
  );

  const triggerCount = Number(dto.summarizationTriggerCount ?? 24);

  const transcript = includeTranscript
    ? await interviewDao.listRecentTranscript(sessionId, contextLimit)
    : [];

  const latestSummary = await interviewDao.getLatestSessionSummary(sessionId);

  const toDtoChat = (m: any): ChatMessage => {
    const role = m?.role === "assistant" ? "assistant" : "user";
    return {
      role,
      content: String(m?.content ?? ""),
    };
  };

  const baseMessages: ChatMessage[] = Array.isArray(dto.messages)
    ? dto.messages.map(toDtoChat)
    : [];

  const lastUserMsg = (() => {
    for (let i = baseMessages.length - 1; i >= 0; i--) {
      if (baseMessages[i].role === "user") return baseMessages[i];
    }
    return null;
  })();

  const userText = lastUserMsg ? String(lastUserMsg.content ?? "").trim() : "";
  if (!userText) throw new Error("User prompt is required");

  const nonSystemMsgs = baseMessages;

  const systemMsgs: ChatMessage[] = sessionSystem
    ? [{ role: "system", content: sessionSystem }]
    : [];

  const transcriptMsgs: ChatMessage[] = includeTranscript
    ? transcript.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content ?? ""), 
      }))
    : [];

  const summaryMsg: ChatMessage[] = latestSummary?.summary_text
    ? [
        {
          role: "system",
          content: `Session summary:\n${latestSummary.summary_text}`,
        },
      ]
    : [];

  const budget = buildEffectiveTokenBudget({
    summaryMsg,
    systemMsgs,
    transcriptMsgs,
    nonSystemMsgs
  });

  const maxOutputTokens = budget.maxOutputTokens;
  const messages: ChatMessage[] = budget.messages;
  const requestLogMessages: ChatMessage[] = budget.requestLogMessages;

  const runId = await interviewDao.insertRun({
    sessionId,
    globalSystemPrompt: "",
    modeSystemPrompt: "",
    userPrompt: userText,
    maxOutputTokens,
    requestJson: JSON.stringify({
      sessionId,
      contextLimit,
      includeTranscript,
      messages: requestLogMessages,
      systemPromptSource: "sessions",
    }),
  });

  if (persistMessages) {
    await interviewDao.insertMessage({
      sessionId,
      role: "user",
      content: userText,
    });
  }

  let streamedText = "";
  let sawAnyToken = false;

  const rawStream = promptBuilder.generateAssistantResponseStream({
    messages,
    maxTokens: maxOutputTokens,
  });

  const stream = (async function* () {
    for await (const delta of rawStream) {
      if (typeof delta === "string" && delta.length) {
        sawAnyToken = true;
        streamedText += delta;
        yield delta;
      }
    }
  })();

  const finalize = async (fullText: string) => {
    // Use streamedText if available, else fallback to fullText parameter
    const finalText = String(streamedText || fullText || "").trim();
    const latencyMs = Date.now() - startMs;

    if (!finalText) {
      await interviewDao.updateRunResult({
        runId,
        status: "error",
        responseText: "",
        responseJson: null,
        tokenInput: null,
        tokenOutput: null,
        latencyMs,
        errorCode: "EMPTY_OUTPUT",
        errorMessage: "Empty assistant text returned by model.",
      });
      throw new Error("Empty assistant text returned by model.");
    }

    await interviewDao.updateRunResult({
      runId,
      status: "success",
      responseText: finalText,
      responseJson: null,
      tokenInput: null,
      tokenOutput: null,
      latencyMs,
    });

    if (persistMessages && finalText.length > 0) {
      await interviewDao.insertMessage({
        sessionId,
        role: "assistant",
        content: finalText,
        metadataJson: JSON.stringify({ runId }),
      });

      await updateSessionSummary({
        sessionId,
        triggerCount,
        sliceLimit: 40,
      });
    }

    return { runId, assistantText: finalText, latencyMs };
  };

  return { runId, stream, finalize };
}

export async function runTurn({
  sessionId,
  dto,
}: {
  sessionId: string;
  dto: RunRequestDto;
}): Promise<RunResultDto> {
  const startMs = Date.now();

  const session = await interviewDao.getSessionById(sessionId);
  if (!session) throw new Error("Session not found");

  const sessionSystem = String(session.system_prompt ?? "").trim();

  const persistMessages =
    typeof dto.persistMessages === "boolean"
      ? dto.persistMessages
      : typeof session.persist_messages === "boolean"
      ? session.persist_messages
      : true;

  const includeTranscript =
    typeof dto.includeTranscript === "boolean"
      ? dto.includeTranscript
      : typeof session.include_transcript === "boolean"
      ? session.include_transcript
      : true;

  const contextLimit = Math.min(
    60,
    Math.max(
      0,
      Number(
        dto.contextMessageLimit ?? session.context_message_limit ?? 20
      )
    )
  );

  const triggerCount = Number(dto.summarizationTriggerCount ?? 24);

  const transcript = includeTranscript
    ? await interviewDao.listRecentTranscript(sessionId, contextLimit)
    : [];
  const latestSummary = await interviewDao.getLatestSessionSummary(sessionId);

  const toDtoChat = (m: any): ChatMessage => {
    const role = m?.role === "assistant" ? "assistant" : "user";
    return {
      role,
      content: String(m?.content ?? ""),
    };
  };

  const baseMessages: ChatMessage[] = Array.isArray(dto.messages)
    ? dto.messages.map(toDtoChat)
    : [];

  const lastUserMsg = (() => {
    for (let i = baseMessages.length - 1; i >= 0; i--) {
      if (baseMessages[i].role === "user") return baseMessages[i];
    }
    return null;
  })();

  const userText = lastUserMsg ? String(lastUserMsg.content ?? "").trim() : "";
  if (!userText) throw new Error("User prompt is required");

  const nonSystemMsgs = baseMessages;

  const systemMsgs: ChatMessage[] = sessionSystem
    ? [{ role: "system", content: sessionSystem }]
    : [];

  const transcriptMsgs: ChatMessage[] = includeTranscript
    ? transcript.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content ?? ""),
      }))
    : [];

  const summaryMsg: ChatMessage[] = latestSummary?.summary_text
    ? [
        {
          role: "system",
          content: `Session summary:\n${latestSummary.summary_text}`,
        },
      ]
    : [];

  const budget = buildEffectiveTokenBudget({
    summaryMsg,
    systemMsgs,
    transcriptMsgs,
    nonSystemMsgs,
  });

  const maxOutputTokens = budget.maxOutputTokens;
  const messages: ChatMessage[] = budget.messages;
  const requestLogMessages: ChatMessage[] = budget.requestLogMessages;

  const runId = await interviewDao.insertRun({
    sessionId,
    globalSystemPrompt: "",
    modeSystemPrompt: "",
    userPrompt: userText,
    maxOutputTokens,
    requestJson: JSON.stringify({
      sessionId,
      contextLimit,
      includeTranscript,
      messages: requestLogMessages,
      systemPromptSource: "sessions",
    }),
  });

  if (persistMessages) {
    await interviewDao.insertMessage({
      sessionId,
      role: "user",
      content: userText,
    });
  }

  try {
    const completion = await promptBuilder.generateAssistantResponse({
      messages,
      maxTokens: maxOutputTokens,
    });

    const assistantText: string = completion?.text ?? "";
    if (!assistantText.trim()) {
      const latencyMs = Date.now() - startMs;

      await interviewDao.updateRunResult({
        runId,
        status: "error",
        responseText: "",
        latencyMs,
        finishReason: completion?.finishReason ?? null,
        errorCode: "EMPTY_OUTPUT",
        errorMessage: "Empty assistant text returned by model.",
      });

      throw new Error("Empty assistant text returned by model.");
    }

    const latencyMs = Date.now() - startMs;

    await interviewDao.updateRunResult({
      runId,
      status: "success",
      responseText: assistantText,
      responseJson: JSON.stringify(completion?.raw ?? null),
      tokenInput: completion?.usage?.promptTokens ?? null,
      tokenOutput: completion?.usage?.completionTokens ?? null,
      latencyMs,
      finishReason: completion?.finishReason ?? null,
    });

    if (persistMessages && assistantText.trim().length > 0) {
      await interviewDao.insertMessage({
        sessionId,
        role: "assistant",
        content: assistantText,
        metadataJson: JSON.stringify({ runId }),
      });

      await updateSessionSummary({
        sessionId,
        triggerCount,
        sliceLimit: 40,
      });
    }

    const data = {
      runId,
      assistantText,
      usage: {
        tokenInput: completion?.usage?.promptTokens ?? null,
        tokenOutput: completion?.usage?.completionTokens ?? null,
        latencyMs,
      },
    };
    return data;
  } catch (err: unknown) {
    const latencyMs = Date.now() - startMs;

    const errorCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as any).code)
        : "UNKNOWN";

    const errorMessage = err instanceof Error ? err.message : String(err);

    await interviewDao.updateRunResult({
      runId,
      status: "error",
      latencyMs,
      errorCode,
      errorMessage,
    });

    throw err;
  }
}

async function updateSessionSummary(params: {
  sessionId: string;
  triggerCount: number;
  sliceLimit: number;
}) {
  const count = await interviewDao.countMessages(params.sessionId);
  if (count < params.triggerCount) return;

  const latest = await interviewDao.getLatestSessionSummary(params.sessionId);

  const slice = await interviewDao.listMessagesForSummarization({
    sessionId: params.sessionId,
    afterMessageId: latest?.last_message_id ?? null,
    limit: params.sliceLimit,
  });

  if (slice.length < 6) return;

  const summaryText = await summarizerAi.summarizeTranscript({
    priorSummary: latest?.summary_text ?? null,
    messages: slice
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  });

  if (!summaryText) return;

  await interviewDao.insertSessionSummary({
    sessionId: params.sessionId,
    summaryText,
    lastMessageId: slice[slice.length - 1].id,
  });
}
