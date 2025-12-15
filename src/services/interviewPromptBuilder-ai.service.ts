import { ChatCompletionResult, ChatMessage } from "../interfaces/Chat";
import * as openAiClient from "../infra/openaiClient";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5";

export async function generateAssistantResponse(args: {
  messages: ChatMessage[];
  maxOutputTokens?: number;
  maxTokens?: number;
}): Promise<ChatCompletionResult> {
  const maxTokens = Number(args.maxOutputTokens ?? args.maxTokens ?? 1200);

  return await openAiClient.responsesClient.openAiClientChatCompletionJsonResponse({
    model: DEFAULT_MODEL,
    messages: args.messages,
    maxTokens,
  });
}

export function generateAssistantResponseStream(args: {
  messages: ChatMessage[];
  maxOutputTokens?: number;
  maxTokens?: number;
}) {
  const maxTokens = Number(args.maxOutputTokens ?? args.maxTokens ?? 1200);

  return openAiClient.responsesClient.openAiClientChatCompletionStream({
    model: DEFAULT_MODEL,
    messages: args.messages,
    maxTokens,
  });
}
