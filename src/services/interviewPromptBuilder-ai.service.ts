import {
  CODING_MODE_MIN,
  CODING_SCORE_PROMPT,
  GLOBAL_SYSTEM_MIN,
  SYSTEM_DESIGN_MODE_MIN,
  SYSTEM_DESIGN_SCORE_PROMPT,
} from "../constants/prompts.constant";
import { ChatCompletionResult, ChatMessage } from "../interfaces/Chat";
import {
  InterviewMode,
  InterviewPersona,
  MessageRecord,
  Seniority,
} from "../interfaces/Interview";
import * as openAiClient from "../infra/openaiClient";

export function buildContextMessages(params: {
  globalSystemPrompt?: string;
  modeSystemPrompt?: string;
  mode: InterviewMode;
  persona: InterviewPersona;
  seniority: Seniority;
  transcript: MessageRecord[];
  userPrompt: string;
  sessionSummary?: string;
}): ChatMessage[] {
  const sys = [
    (params.globalSystemPrompt || GLOBAL_SYSTEM_MIN).trim(),
    (params.modeSystemPrompt || getDefaultModeSystemPrompt(params.mode)).trim(),
    params.sessionSummary?.trim()
      ? `SESSION SUMMARY:\n${params.sessionSummary.trim()}`
      : "",
    formatPersonaLine(params.persona),
    `Seniority target: ${params.seniority}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const messages: ChatMessage[] = [{ role: "system", content: sys }];

  // v1: only include user/assistant to keep context clean
  for (const m of params.transcript) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.content });
    }
  }

  messages.push({ role: "user", content: params.userPrompt.trim() });
  return messages;
}

export function buildScoringMessages(params: {
  scoreSystemPrompt: string;
  userPrompt: string;
  assistantText: string;
}): ChatMessage[] {
  return [
    { role: "system", content: params.scoreSystemPrompt },
    {
      role: "user",
      content:
        `Candidate prompt:\n${params.userPrompt}\n\n` +
        `Candidate response:\n${params.assistantText}\n`,
    },
  ];
}

export async function generateAssistantResponse(args: {
  messages: ChatMessage[];
  maxTokens: number;
}): Promise<ChatCompletionResult> {
  const result =
    await openAiClient.responsesClient.openAiClientChatCompletionJsonResponse({
      model: "gpt-5",
      messages: args.messages,
      maxTokens: args.maxTokens,
    });

  return result;
}

export function generateAssistantResponseStream(args: {
  messages: ChatMessage[];
  maxTokens: number;
}) {
  return openAiClient.responsesClient.openAiClientChatCompletionStream({
    model: "gpt-5",
    messages: args.messages,
    maxTokens: args.maxTokens,
  });
}

/* Scoring / evaluation (deterministic) */
export async function generateScoreResponse(args: { messages: ChatMessage[] }) {
  return openAiClient.responsesClient.openAiClientChatCompletionJsonResponse({
    model: "gpt-5",
    messages: args.messages,
    maxTokens: 700,
    responseFormat: { type: "json_object" },
  });
}

function formatPersonaLine(persona: InterviewPersona): string {
  if (persona === "friendly") return "Tone: friendly";
  if (persona === "harsh") return "Tone: harsh and skeptical";
  return "Tone: realistic";
}

export function computeMaxOutputTokens(params: {
  modeId: "coding" | "system_design";
  messages: Array<{ role: string; content: string }>;
  model: string;
}): number {
  const modeCap = params.modeId === "system_design" ? 16000 : 8000;

  // Prefer env override so this stays forward-compatible with new models.
  const envVal = Number(process.env.OPENAI_CONTEXT_WINDOW_TOKENS);
  const contextWindow =
    Number.isFinite(envVal) && envVal > 0
      ? envVal
      : params.model === "gpt-5"
      ? 128000
      : 32000;

  const safetyMargin = 200;

  // Cheap approximation: ~4 chars per token + small overhead per message.
  let chars = 0;
  for (const m of params.messages) chars += m.content?.length ?? 0;
  const approxTokens = Math.ceil(chars / 4) + params.messages.length * 8;

  const available = contextWindow - approxTokens - safetyMargin;

  // hard clamp to what can actually fit
  const clamped = Math.min(modeCap, Math.max(0, available));

  // safe floor ONLY if it fits
  const minOut = 800; // for gpt-5; can be env-driven
  return clamped >= minOut ? clamped : Math.max(0, clamped);
}

function toFiniteNumberOrDefault(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function resolveContextLimit(
  contextMessageLimit: number | undefined
): number {
  return toFiniteNumberOrDefault(contextMessageLimit, 20);
}

function getDefaultModeSystemPrompt(mode: InterviewMode): string {
  return mode === "coding" ? CODING_MODE_MIN : SYSTEM_DESIGN_MODE_MIN;
}

export function getScoreSystemPrompt(mode: InterviewMode): string {
  return mode === "coding" ? CODING_SCORE_PROMPT : SYSTEM_DESIGN_SCORE_PROMPT;
}
