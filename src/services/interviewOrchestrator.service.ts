import { RunRequestDto, RunResultDto } from "../interfaces/Interview";
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
    score: any;
    latencyMs: number;
  }>;
}> {
  const startMs = Date.now();

  const persistMessages = dto.persistMessages !== false;
  const includeTranscript = dto.includeTranscriptInContext !== false;
  const contextLimit = promptBuilder.resolveContextLimit(
    dto.contextMessageLimit
  );

  const session = await interviewDao.getSessionById(sessionId);
  if (!session) throw new Error("Session not found");

  const transcript = includeTranscript
    ? await interviewDao.listRecentTranscript(sessionId, contextLimit)
    : [];

  const enableSummarization = dto.enableSummarization !== false;
  const triggerCount = Number(dto.summarizationTriggerCount ?? 24);

  const latestSummary = enableSummarization
    ? await interviewDao.getLatestSessionSummary(sessionId)
    : null;

  const messages = promptBuilder.buildContextMessages({
    globalSystemPrompt: dto.globalSystemPrompt,
    modeSystemPrompt: dto.modeSystemPrompt,
    mode: session.modeId,
    persona: session.persona,
    seniority: session.seniority,
    transcript,
    userPrompt: dto.userPrompt,
    sessionSummary: latestSummary?.summary_text,
  });

  const maxOutputTokensRaw = promptBuilder.computeMaxOutputTokens({
    modeId: session.modeId,
    messages,
    model: process.env.OPENAI_MODEL || "gpt-5",
  });

  // Safe floor to avoid empty visible output for reasoning models.
  const maxOutputTokens = Math.max(maxOutputTokensRaw, 800);

  const runId = await interviewDao.insertRun({
    sessionId,
    globalSystemPrompt: (dto.globalSystemPrompt || "").trim(),
    modeSystemPrompt: (dto.modeSystemPrompt || "").trim(),
    userPrompt: dto.userPrompt.trim(),
    maxOutputTokens,
    requestJson: JSON.stringify({ messages }),
  });

  if (persistMessages) {
    await interviewDao.insertMessage({
      sessionId,
      role: "user",
      content: dto.userPrompt.trim(),
    });
  }

  const stream = promptBuilder.generateAssistantResponseStream({
    messages,
    maxTokens: maxOutputTokens,
  });

  const finalize = async (fullText: string) => {
    const finalText = typeof fullText === "string" ? fullText : "";

    const latencyMs = Date.now() - startMs;

    await interviewDao.updateRunResult({
      runId,
      status: "ok",
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

      if (enableSummarization) {
        await maybeUpdateSessionSummary({
          sessionId,
          triggerCount,
          sliceLimit: 40,
        });
      }
    }

    // IMPORTANT: Consider skipping scoring when finalText is empty to avoid extra calls.
    const scorePayload = finalText.trim()
      ? await scoreTurn(session.modeId, dto.userPrompt.trim(), finalText)
      : {
          total: 0,
          rubric: {},
          strengths: [],
          weaknesses: ["Assistant response was empty (no stream deltas)."],
          actions: ["Fix upstream streaming to emit deltas."],
          followups: [],
        };

    if (finalText.trim()) {
      await interviewDao.insertScore({
        sessionId,
        runId,
        totalScore: scorePayload.total,
        rubricJson: JSON.stringify(scorePayload.rubric),
        strengthsJson: JSON.stringify(scorePayload.strengths),
        weaknessesJson: JSON.stringify(scorePayload.weaknesses),
        actionsJson: JSON.stringify(scorePayload.actions),
        followupsJson: JSON.stringify(scorePayload.followups ?? []),
      });
    }

    return { runId, assistantText: finalText, score: scorePayload, latencyMs };
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
  const includeTranscript = dto.includeTranscriptInContext !== false;
  const contextLimit = promptBuilder.resolveContextLimit(
    dto.contextMessageLimit
  );
  const session = await interviewDao.getSessionById(sessionId);
  if (!session) throw new Error("Session not found");

  const transcript = includeTranscript
    ? await interviewDao.listRecentTranscript(sessionId, contextLimit)
    : [];
  const enableSummarization = dto.enableSummarization !== false;
  const triggerCount = Number(dto.summarizationTriggerCount ?? 24);

  const latestSummary = enableSummarization
    ? await interviewDao.getLatestSessionSummary(sessionId)
    : null;

  const messages = promptBuilder.buildContextMessages({
    globalSystemPrompt: dto.globalSystemPrompt,
    modeSystemPrompt: dto.modeSystemPrompt,
    mode: session.modeId,
    persona: session.persona,
    seniority: session.seniority,
    transcript,
    userPrompt: dto.userPrompt,
    sessionSummary: latestSummary?.summary_text,
  });

  const maxOutputTokensRaw = promptBuilder.computeMaxOutputTokens({
    modeId: session.modeId,
    messages,
    model: process.env.OPENAI_MODEL || "gpt-5",
  });

  // Safe floor to avoid empty visible output for reasoning models.
  const maxOutputTokens = Math.max(maxOutputTokensRaw, 800);

  const runId = await interviewDao.insertRun({
    sessionId,
    globalSystemPrompt: (dto.globalSystemPrompt || "").trim(),
    modeSystemPrompt: (dto.modeSystemPrompt || "").trim(),
    userPrompt: dto.userPrompt.trim(),
    maxOutputTokens,
    requestJson: JSON.stringify({ messages }),
  });

  if (persistMessages) {
    await interviewDao.insertMessage({
      sessionId,
      role: "user",
      content: dto.userPrompt.trim(),
    });
  }

  try {
    const completion = await promptBuilder.generateAssistantResponse({
      messages,
      maxTokens: maxOutputTokens,
    });

    const assistantText: string = completion?.text ?? "";
    const latencyMs = Date.now() - startMs;

    await interviewDao.updateRunResult({
      runId,
      status: "ok",
      responseText: assistantText,
      responseJson: JSON.stringify(completion?.raw ?? null),
      tokenInput: completion?.usage?.promptTokens ?? null,
      tokenOutput: completion?.usage?.completionTokens ?? null,
      latencyMs,
    });

    if (persistMessages && assistantText.trim().length > 0) {
      await interviewDao.insertMessage({
        sessionId,
        role: "assistant",
        content: assistantText,
        metadataJson: JSON.stringify({ runId }),
      });

      if (enableSummarization) {
        await maybeUpdateSessionSummary({
          sessionId,
          triggerCount,
          sliceLimit: 40,
        });
      }
    }

    const scorePayload = assistantText.trim()
      ? await scoreTurn(session.modeId, dto.userPrompt.trim(), assistantText)
      : {
          total: 0,
          rubric: {},
          strengths: [],
          weaknesses: ["Assistant response was empty."],
          actions: ["Increase maxOutputTokens or reduce prompt size."],
          followups: [],
        };

    if (assistantText.trim()) {
      await interviewDao.insertScore({
        sessionId,
        runId,
        totalScore: scorePayload.total,
        rubricJson: JSON.stringify(scorePayload.rubric),
        strengthsJson: JSON.stringify(scorePayload.strengths),
        weaknessesJson: JSON.stringify(scorePayload.weaknesses),
        actionsJson: JSON.stringify(scorePayload.actions),
        followupsJson: JSON.stringify(scorePayload.followups ?? []),
      });
    }

    const data = {
      runId: runId,
      assistantText: assistantText,
      score: scorePayload,
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

async function maybeUpdateSessionSummary(params: {
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
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  });

  if (!summaryText) return;

  await interviewDao.insertSessionSummary({
    sessionId: params.sessionId,
    summaryText,
    lastMessageId: slice[slice.length - 1].id,
  });
}

async function scoreTurn(
  modeId: "coding" | "system_design",
  userPrompt: string,
  assistantText: string
) {
  const scoreSystemPrompt = promptBuilder.getScoreSystemPrompt(modeId);
  const scoringMessages = promptBuilder.buildScoringMessages({
    scoreSystemPrompt,
    userPrompt,
    assistantText,
  });

  try {
    const resp = await promptBuilder.generateScoreResponse({
      messages: scoringMessages,
    });

    const parsed = tryParseJson(resp?.text ?? "");

    if (parsed && typeof parsed.total_score === "number") {
      return {
        total: parsed.total_score,
        rubric: parsed.rubric || {},
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        actions: parsed.actions || [],
        followups: parsed.followups || [],
      };
    }

    return {
      total: 0,
      rubric: {},
      strengths: [],
      weaknesses: ["Scoring output was invalid JSON."],
      actions: ["Re-run scoring. Ensure JSON-only scoring prompt."],
      followups: modeId === "coding" ? [] : [],
    };
  } catch (err) {
    // Scoring failure should not break the interview turn; return a safe result.
    return {
      total: 0,
      rubric: {},
      strengths: [],
      weaknesses: ["Scoring call failed."],
      actions: ["Retry scoring."],
      followups: modeId === "coding" ? [] : [],
    };
  }
}

function tryParseJson(text: string): any | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Direct parse first.
  try {
    return JSON.parse(trimmed);
  } catch {
    // fallthrough
  }

  // Strip ```json fences.
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    // fallthrough
  }

  // Last resort: parse first {...} block.
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = unfenced.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }

  return null;
}
