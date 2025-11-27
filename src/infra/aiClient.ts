// aiClient.ts
import { responsesClient as openAiClient, embedText as openaiEmbed, createEmbeddingForText as openaiCreateEmbed, OpenAiQuotaError, Message } from './openaiClient';
import { responsesClient as geminiClient, embedText as geminiEmbed, createEmbeddingForText as geminiCreateEmbed, GeminiQuotaError } from './geminiAiClient';
import { z } from 'zod';

const AI_PROVIDER = process.env.AI_PROVIDER;

export const responsesClient = {
  async aiClientJsonResponse<T>({
    messages,
    schema,
    temperature,
  }: {
    messages: Message[];
    schema: z.ZodSchema<T>;
    temperature?: number;
  }): Promise<T> {
    const provider = AI_PROVIDER;

    // Decide model ONCE based on provider + purpose
    let model: string;

    if (provider === "gemini") {
      model = "gemini-2.5-flash";
      return geminiClient.geminiClientJsonResponse({ model, messages, schema, temperature });
    } else {
      model = "gpt-4.1-mini";
      return openAiClient.openAiClientJsonResponse({ model, messages, schema, temperature });
    }
  },
};

export const AiQuotaError = AI_PROVIDER === "gemini" ? GeminiQuotaError : OpenAiQuotaError;
export const embedText = AI_PROVIDER === "gemini" ? geminiEmbed : openaiEmbed;
export const createEmbeddingForText = AI_PROVIDER === "gemini" ? geminiCreateEmbed : openaiCreateEmbed;

export interface AiClient {
  jsonResponse<T>(
    args: {
      model?: string;
      messages: { role: 'system' | 'user'; content: string }[];
      schema: z.ZodSchema<T>;
      temperature?: number;
    }
  ): Promise<T>;

  textResponse(
    args: {
      model?: string;
      messages: { role: 'system' | 'user'; content: string }[];
      temperature?: number;
    }
  ): Promise<string>;

  embedText(text: string): Promise<number[]>;
}