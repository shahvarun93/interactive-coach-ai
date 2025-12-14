// 1) NEW FILE
// src/services/interviewSummarizer-ai.service.ts

import { ChatMessage } from "../interfaces/Chat";
import * as openAiClient from "../infra/openaiClient";

export async function summarizeTranscript(args: {
  priorSummary: string | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const system = [
    "You are a summarization engine for an interview chat.",
    "Write a compact, factual running summary that preserves: goals, constraints, key decisions, APIs/contracts, schema, bugs/fixes, and next steps.",
    "No fluff. Prefer short bullets.",
    "Return plain text only (no markdown fences).",
  ].join("\n");

  const transcript = args.messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const user = [
    `PRIOR SUMMARY:\n${args.priorSummary ?? "(none)"}`,
    `\nNEW MESSAGES:\n${transcript}`,
    "\nUpdate the summary. Keep it concise (roughly 200-400 tokens).",
  ].join("\n");

  const msgs: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const resp = await openAiClient.responsesClient.openAiClientChatCompletionJsonResponse({
    model: "gpt-5",
    messages: msgs,
    maxTokens: 1200,
  });

  return (resp.text ?? "").trim();
}


// 2) EDIT FILE
// src/services/interviewPromptBuilder-ai.service.ts
// Add sessionSummary?: string to buildContextMessages params and inject into system block.

// --- PATCH ---
// In buildContextMessages params type:
//   sessionSummary?: string;
//
// In sys array:
//   params.sessionSummary ? `SESSION SUMMARY:\n${params.sessionSummary}` : "",


// 3) EDIT FILE
// src/services/interviewOrchestrator.service.ts
// - Fetch latest summary before building messages and pass into promptBuilder.
// - After persisting assistant message, call maybeUpdateSessionSummary(sessionId, dto)

// --- PATCH (add near imports) ---
// import * as summarizerAi from "./interviewSummarizer-ai.service";
//
// --- PATCH (add helper) ---
// async function maybeUpdateSessionSummary(args: { sessionId: string; triggerCount: number; sliceLimit: number }) { ... }
//
// --- PATCH (runTurn) ---
// const enableSummarization = dto.enableSummarization !== false;
// const triggerCount = Number(dto.summarizationTriggerCount ?? 24);
// const latestSummary = enableSummarization ? await interviewDao.getLatestSessionSummary(sessionId) : null;
// ... build messages with sessionSummary: latestSummary?.summary_text
// ... after insert assistant message (and before return):
// if (enableSummarization) await maybeUpdateSessionSummary({ sessionId, triggerCount, sliceLimit: 40 });
//
// --- PATCH (streamTurn finalize) ---
// after insert assistant message (only when finalText non-empty): call maybeUpdateSessionSummary(...)
