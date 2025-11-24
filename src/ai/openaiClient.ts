import OpenAI from 'openai';
import type {
  Response,
  ResponseCreateParams,
} from 'openai/resources/responses/responses';
/* Zod is in openAiClient.ts to make the AI output reliable and type-safe instead of “whatever the model felt like returning.” 
Think of it as a strict bouncer at the door: 
if the JSON isn’t exactly what we expect, 
we reject it early with a clear error rather than letting bugs leak through the app.
*/
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

/*
This function walks the output:
	•	finds the first output_text
	•	returns its trimmed text
	•	if none exists → throws an error

    Why we did this:
    The Responses API can output other things too (tool calls, audio, etc).
    So we must explicitly pick the text part.
*/
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

/*
Flow:
	1.	Call OpenAI with system+user messages.
	2.	Extract raw output text.
	3.	JSON.parse(raw) → turn it into an object.
	4.	Zod validates it using schema.parse(...).
	5.	If valid → return typed object T
	6.	If invalid → throw a clear error
*/
async function openAiClientJsonResponse<T>({
  model = 'gpt-4.1-mini',
  messages,
  schema,
  temperature,
}: {
  model?: string;
  messages: Message[]; // system and user prompt
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

async function openAiClientTextResponse({
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

export async function createEmbeddingForText(input: string): Promise<number[]> {
  if (!input.trim()) {
    throw new Error("Cannot create embedding for empty text");
  }

  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error("No embedding returned from OpenAI");
  }
  return embedding;
}

export async function embedText(text: string): Promise<number[]> {
  const resp = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return resp.data[0].embedding;
}

export const responsesClient = {
  openAiClientJsonResponse: openAiClientJsonResponse,
  openAiClientTextResponse: openAiClientTextResponse,
};
