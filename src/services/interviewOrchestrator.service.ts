import { RunRequestDto, RunResultDto } from "../interfaces/Interview";
import type { ChatMessage } from "../interfaces/Chat";
import * as interviewDao from "../dao/interview.dao";
import * as promptBuilder from "./interviewPromptBuilder-ai.service";
import * as summarizerAi from "./interviewSummarizer-ai.service";

export async function createSession(params: {
  modeId: "coding" | "system_design";
  persona?: string;
  seniority?: string;
}): Promise<{ sessionId: string }> {
  const sessionId = await interviewDao.insertSession({
    modeId: params.modeId,
    persona: params.persona,
    seniority: params.seniority,
  });
  return { sessionId };
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

  const persistMessages = dto.persistMessages !== false;
  const includeTranscript = dto.includeTranscript !== false;

  const session = await interviewDao.getSessionById(sessionId);
  if (!session) throw new Error("Session not found");

  const contextLimit = Math.min(
    60,
    Math.max(0, Number(dto.contextMessageLimit ?? 20))
  );

  const transcript = includeTranscript
    ? await interviewDao.listRecentTranscript(sessionId, contextLimit)
    : [];

  const triggerCount = Number(dto.summarizationTriggerCount ?? 24);

  const latestSummary = await interviewDao.getLatestSessionSummary(sessionId);

  const toChat = (m: any): ChatMessage => ({
    role: m.role as "system" | "user" | "assistant",
    content: String(m.content ?? ""),
  });

  const baseMessages: ChatMessage[] = Array.isArray(dto.messages)
    ? dto.messages.map(toChat)
    : [];
  const lastUser = baseMessages.length
    ? baseMessages[baseMessages.length - 1]
    : null;
  const userText =
    lastUser && lastUser.role === "user" && typeof lastUser.content === "string"
      ? lastUser.content.trim()
      : "";

  const nonSystemMsgs = baseMessages.filter((m) => m.role !== "system");

  const requestedSystem =
    baseMessages
      .filter((m) => m.role === "system")
      .map((m) => String(m.content ?? "").trim())
      .find((s) => s.length) ?? "";

  const initialSystem = await interviewDao.getInitialSystemPrompt(sessionId);
  const effectiveSystem = initialSystem ? initialSystem : requestedSystem;

  const systemMsgs: ChatMessage[] = effectiveSystem
    ? [{ role: "system", content: effectiveSystem }]
    : [];

  const transcriptMsgs: ChatMessage[] = includeTranscript
    ? transcript.map(toChat)
    : [];

  const summaryMsg: ChatMessage[] = latestSummary?.summary_text
    ? [
        {
          role: "system",
          content: `Session summary:\n${latestSummary.summary_text}`,
        },
      ]
    : [];

  const messages: ChatMessage[] = [
    ...summaryMsg,
    ...systemMsgs,
    ...transcriptMsgs,
    ...nonSystemMsgs,
  ];

  const maxOutputTokens = Math.min(
    8192,
    Math.max(256, Number(dto.maxOutputTokens ?? 2048))
  );

  const runId = await interviewDao.insertRun({
    sessionId,
    globalSystemPrompt: (effectiveSystem || "").trim(),
    modeSystemPrompt: "",
    userPrompt: userText,
    maxOutputTokens,
    requestJson: JSON.stringify({ messages }),
  });

  if (persistMessages) {
    await interviewDao.insertMessage({
      sessionId,
      role: "user",
      content: userText,
    });
  }

  const stream = promptBuilder.generateAssistantResponseStream({
    messages,
    maxTokens: maxOutputTokens,
  });

  const finalize = async (fullText: string) => {
    const finalText = typeof fullText === "string" ? fullText : "";

    const latencyMs = Date.now() - startMs;

    if (!finalText.trim()) {
      await interviewDao.updateRunResult({
        runId,
        status: "error",
        latencyMs,
        errorCode: "EMPTY_MODEL_OUTPUT",
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

    if (persistMessages && finalText.trim().length > 0) {
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

  const persistMessages = dto.persistMessages !== false;
  const includeTranscript = dto.includeTranscript !== false;

  const session = await interviewDao.getSessionById(sessionId);
  if (!session) throw new Error("Session not found");

  const contextLimit = Math.min(
    60,
    Math.max(0, Number(dto.contextMessageLimit ?? 20))
  );

  const transcript = includeTranscript
    ? await interviewDao.listRecentTranscript(sessionId, contextLimit)
    : [];
  const triggerCount = Number(dto.summarizationTriggerCount ?? 24);

  const latestSummary = await interviewDao.getLatestSessionSummary(sessionId);

  const toChat = (m: any): ChatMessage => ({
    role: m.role as "system" | "user" | "assistant",
    content: String(m.content ?? ""),
  });

  const baseMessages: ChatMessage[] = Array.isArray(dto.messages)
    ? dto.messages.map(toChat)
    : [];
  const lastUser = baseMessages.length
    ? baseMessages[baseMessages.length - 1]
    : null;
  const userText =
    lastUser && lastUser.role === "user" && typeof lastUser.content === "string"
      ? lastUser.content.trim()
      : "";

  const nonSystemMsgs = baseMessages.filter((m) => m.role !== "system");

  const requestedSystem =
    baseMessages
      .filter((m) => m.role === "system")
      .map((m) => String(m.content ?? "").trim())
      .find((s) => s.length) ?? "";

  const initialSystem = await interviewDao.getInitialSystemPrompt(sessionId);
  const effectiveSystem = initialSystem ? initialSystem : requestedSystem;

  const systemMsgs: ChatMessage[] = effectiveSystem
    ? [{ role: "system", content: effectiveSystem }]
    : [];

  const transcriptMsgs: ChatMessage[] = includeTranscript
    ? transcript.map(toChat)
    : [];

  const summaryMsg: ChatMessage[] = latestSummary?.summary_text
    ? [
        {
          role: "system",
          content: `Session summary:\n${latestSummary.summary_text}`,
        },
      ]
    : [];

  const messages: ChatMessage[] = [
    ...summaryMsg,
    ...systemMsgs,
    ...transcriptMsgs,
    ...nonSystemMsgs,
  ];

  const maxOutputTokens = Math.min(
    8192,
    Math.max(256, Number(dto.maxOutputTokens ?? 2048))
  );

  const runId = await interviewDao.insertRun({
    sessionId,
    globalSystemPrompt: (effectiveSystem || "").trim(),
    modeSystemPrompt: "",
    userPrompt: userText,
    maxOutputTokens,
    requestJson: JSON.stringify({ messages }),
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
        latencyMs,
        errorCode: "EMPTY_MODEL_OUTPUT",
        errorMessage: "Empty assistant text returned by model.",
        finishReason: completion?.finishReason ?? null,
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
