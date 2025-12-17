// src/interfaces/OpenAIClient.ts
import { z } from "zod";
import { ChatMessage } from "./Chat";

// Define Message type here to avoid circular dependency with infra/openaiClient.ts
// This should match the Message type in infra/openaiClient.ts
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface OpenAiClientJsonResponseParams<T> {
  model?: string;
  messages: Message[];
  schema: z.ZodSchema<T>;
  temperature?: number;
}

export interface OpenAiClientTextResponseParams {
  model?: string;
  messages: Message[];
  temperature?: number;
}

export interface OpenAiClientCreateChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  responseFormat?: any;
}

export interface OpenAiClientChatCompletionStreamParams {
  model: string;
  messages: Message[];
  maxTokens: number;
}

