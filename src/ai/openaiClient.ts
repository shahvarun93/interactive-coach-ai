import OpenAI from 'openai';
import type {
  Response,
  ResponseCreateParams,
} from 'openai/resources/responses/responses';
import { z } from 'zod';

export type Message = {
  role: 'system' | 'user';
  content: string;
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function toResponseInput(messages: Message[]): ResponseCreateParams['input'] {
  return messages.map((message) => ({
    role: message.role,
    content: [
      {
        type: 'input_text',
        text: message.content,
      },
    ],
  })) as ResponseCreateParams['input'];
}

function extractText(response: Response): string {
  for (const item of response.output ?? []) {
    if ('content' in item && Array.isArray((item as { content?: unknown }).content)) {
      for (const chunk of (item as { content: { type: string; text?: string }[] }).content) {
        if (chunk.type === 'output_text' && chunk.text) {
          return chunk.text.trim();
        }
      }
    }
  }
  throw new Error('OpenAI response did not contain output_text content');
}

async function jsonResponse<T>({
  model = 'gpt-4.1-mini',
  messages,
  schema,
  temperature,
}: {
  model?: string;
  messages: Message[];
  schema: z.ZodSchema<T>;
  temperature?: number;
}): Promise<T> {
  const response = await client.responses.create({
    model,
    input: toResponseInput(messages),
    temperature,
  });

  const raw = extractText(response);

  try {
    return schema.parse(JSON.parse(raw));
  } catch (err) {
    throw new Error(
      `Failed to parse or validate OpenAI JSON response: ${(err as Error).message}`,
    );
  }
}

async function textResponse({
  model = 'gpt-4.1-mini',
  messages,
  temperature,
}: {
  model?: string;
  messages: Message[];
  temperature?: number;
}): Promise<string> {
  const response = await client.responses.create({
    model,
    input: toResponseInput(messages),
    temperature,
  });

  return extractText(response);
}

export const responsesClient = {
  json: jsonResponse,
  text: textResponse,
};
