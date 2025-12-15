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

  const text = await openAiClient.responsesClient.openAiClientTextResponse({
    messages: msgs,
  });
  

  return (text.trim() ?? "").trim();
}