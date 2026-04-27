import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParams,
} from "openai/resources/responses/responses";
/* Zod is in openAiClient.ts to make the AI output reliable and type-safe instead of “whatever the model felt like returning.” 
Think of it as a strict bouncer at the door: 
if the JSON isn’t exactly what we expect, 
we reject it early with a clear error rather than letting bugs leak through the app.
*/
import { z } from "zod";
import { ChatCompletionResult, ChatMessage } from "../interfaces/Chat";
import { Stream } from "openai/streaming";
import type { Message } from "../interfaces/OpenAIClient";
import {
  OpenAiClientJsonResponseParams,
  OpenAiClientTextResponseParams,
  OpenAiClientCreateChatCompletionParams,
  OpenAiClientChatCompletionStreamParams,
} from "../interfaces/OpenAIClient";

const AI_LOG_DEBUG = process.env.AI_LOG_DEBUG === "1";

// Basic in-memory aggregation for OpenAI usage.
// Enterprise rationale:
// - Single place to track tokens and cost, instead of sprinkling logic across services.
// - Can later be exported via a metrics endpoint or pushed to Prometheus / logs.
type OpenAiUsageTotals = {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
};

type ModelPricing = {
  // USD per 1K input tokens
  inputUsdPer1K: number;
  // USD per 1K output tokens (if different from input)
  outputUsdPer1K?: number;
};

// NOTE: Fill these with real prices from OpenAI's pricing page for accurate cost.
// Keeping them as 0 by default so the wiring is safe until configured.
const MODEL_PRICING_USD: Record<string, ModelPricing> = {
  "gpt-5": { inputUsdPer1K: 0, outputUsdPer1K: 0 },
  "gpt-4.1-mini": { inputUsdPer1K: 0, outputUsdPer1K: 0 },
  "text-embedding-3-small": { inputUsdPer1K: 0 },
};

const openAiUsageByModel: Record<string, OpenAiUsageTotals> = {};

function getOrInitModelTotals(model: string): OpenAiUsageTotals {
  if (!openAiUsageByModel[model]) {
    openAiUsageByModel[model] = {
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    };
  }
  return openAiUsageByModel[model];
}

function recordOpenAiUsage(model: string, usage: any) {
  // The various OpenAI endpoints expose slightly different usage shapes.
  const rawUsage = usage ?? {};
  const promptTokens =
    rawUsage.prompt_tokens ??
    rawUsage.input_tokens ??
    null;
  const completionTokens =
    rawUsage.completion_tokens ??
    rawUsage.output_tokens ??
    null;

  const totalTokens =
    rawUsage.total_tokens ??
    (promptTokens != null || completionTokens != null
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : null);

  const pricing: ModelPricing =
    MODEL_PRICING_USD[model] ?? { inputUsdPer1K: 0, outputUsdPer1K: 0 };

  const inputPrice = pricing.inputUsdPer1K ?? 0;
  const outputPrice =
    pricing.outputUsdPer1K != null ? pricing.outputUsdPer1K : inputPrice;

  const promptCostUsd =
    promptTokens != null ? (promptTokens / 1000) * inputPrice : 0;
  const completionCostUsd =
    completionTokens != null ? (completionTokens / 1000) * outputPrice : 0;

  const totals = getOrInitModelTotals(model);
  totals.calls += 1;
  if (promptTokens != null) {
    totals.promptTokens += promptTokens;
  }
  if (completionTokens != null) {
    totals.completionTokens += completionTokens;
  }
  if (totalTokens != null) {
    totals.totalTokens += totalTokens;
  }
  totals.costUsd += promptCostUsd + completionCostUsd;
}

// Snapshot for metrics endpoint / debugging.
// Returns a deep-cloned view so callers can't mutate internal state.
export function getOpenAiUsageSnapshot(): Record<string, OpenAiUsageTotals> {
  return JSON.parse(JSON.stringify(openAiUsageByModel));
}

export class OpenAiQuotaError extends Error {
  public original: unknown;

  constructor(message: string, original?: unknown) {
    super(message);
    this.name = "OpenAiQuotaError";
    this.original = original;
  }
}

async function timeOpenAiCall<T>(
  label: string,
  model: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    if (AI_LOG_DEBUG) {
      const ms = Date.now() - start;
      console.log("[ai]", label, "model=", model, "latency_ms=", ms);
    }
    const elapsed = Date.now() - start;
    console.log(`[ai] ${label} ok after_ms=${elapsed}`);
    return result;
  } catch (err: any) {
    if (AI_LOG_DEBUG) {
      const ms = Date.now() - start;
      console.warn(
        "[ai]",
        label,
        "model=",
        model,
        "error after_ms=",
        ms,
        "msg=",
        (err as Error).message
      );
    }
    const elapsed = Date.now() - start;
    const msg = err?.message || String(err);
    const status = err?.status;
    const code = err?.code ?? err?.error?.code;

    console.error(`[ai] ${label} error after_ms=${elapsed} msg=${msg}`);

    // Normalize "insufficient_quota" into a specific error type
    if (status === 429 && code === "insufficient_quota") {
      throw new OpenAiQuotaError(msg, err);
    }

    throw err;
  }
}

export type { Message } from "../interfaces/OpenAIClient";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function supportsTemperature(model: string): boolean {
  // Some models (e.g., gpt-5) reject the temperature parameter in the Responses API.
  return !model.startsWith("gpt-5");
}

function toResponseInput(messages: Message[]): ResponseCreateParams["input"] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  })) as ResponseCreateParams["input"];
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
    if (
      "content" in item &&
      Array.isArray((item as { content?: unknown }).content)
    ) {
      for (const chunk of (
        item as { content: { type: string; text?: string }[] }
      ).content) {
        if (chunk.type === "output_text" && chunk.text) {
          return chunk.text.trim();
        }
      }
    }
  }
  throw new Error("OpenAI response did not contain output_text content");
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
  model = "gpt-4.1-mini",
  messages,
  schema,
  temperature,
}: OpenAiClientJsonResponseParams<T>): Promise<T> {
  const payload: ResponseCreateParams = {
    model,
    input: toResponseInput(messages),
  };
  if (typeof temperature === "number" && supportsTemperature(model)) {
    payload.temperature = temperature;
  }

  const response = await timeOpenAiCall("json_response", model, () =>
    client.responses.create(payload)
  );

  recordOpenAiUsage(model, (response as any).usage);

  const raw = extractText(response);

  try {
    return schema.parse(JSON.parse(raw));
  } catch (err) {
    throw new Error(
      `Failed to parse or validate OpenAI JSON response: ${
        (err as Error).message
      }`
    );
  }
}

async function openAiClientTextResponse({
  model = "gpt-4.1-mini",
  messages,
  temperature,
}: OpenAiClientTextResponseParams): Promise<string> {
  const payload: ResponseCreateParams = {
    model,
    input: toResponseInput(messages),
  };
  if (typeof temperature === "number" && supportsTemperature(model)) {
    payload.temperature = temperature;
  }

  const response = await timeOpenAiCall("text_response", model, () =>
    client.responses.create(payload)
  );

  recordOpenAiUsage(model, (response as any).usage);

  return extractText(response);
}

async function openAiClientCreateChatCompletion<T>(
  params: OpenAiClientCreateChatCompletionParams
): Promise<ChatCompletionResult> {
  const response = await timeOpenAiCall("chat_completion", params.model, () =>
    client.chat.completions.create({
      model: params.model,
      messages: params.messages,
      max_completion_tokens: params.maxTokens,
      ...(params.responseFormat ? { response_format: params.responseFormat} : {})
    })
  );

  // Chat completions expose detailed usage; we account for them here.
  recordOpenAiUsage(params.model, response.usage);

  return {
    text: response.choices?.[0]?.message?.content ?? "",
    finishReason: response.choices?.[0]?.finish_reason ?? null,
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? null,
      completionTokens: response.usage?.completion_tokens ?? null
    },
    raw: response,
  };
}

async function* openAiClientChatCompletionStream(
  params: OpenAiClientChatCompletionStreamParams
): AsyncGenerator<string, void, void> {
  const stream = await timeOpenAiCall("chat_completion_stream", params.model, () =>
    client.chat.completions.create({
      model: params.model,
      messages: params.messages,
      max_completion_tokens: params.maxTokens,
      stream: true,
    }));
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length) {
        yield delta;
      }
    }
}

export async function createEmbeddingForText(input: string): Promise<number[]> {
  if (!input.trim()) {
    throw new Error("Cannot create embedding for empty text");
  }

  const model = "text-embedding-3-small";

  const response = await timeOpenAiCall("embedding_create", model, () =>
    client.embeddings.create({
      model,
      input,
    })
  );

  // Embeddings contribute significantly to RAG cost at scale; track them too.
  recordOpenAiUsage(model, (response as any).usage);

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error("No embedding returned from OpenAI");
  }
  return embedding;
}

export async function embedText(text: string): Promise<number[]> {
  const model = "text-embedding-3-small";

  const resp = await timeOpenAiCall("embedding_text", model, () =>
    client.embeddings.create({
      model,
      input: text,
    })
  );

  recordOpenAiUsage(model, (resp as any).usage);

  return resp.data[0].embedding;
}

export const responsesClient = {
  openAiClientJsonResponse: openAiClientJsonResponse,
  openAiClientTextResponse: openAiClientTextResponse,
  openAiClientChatCompletionJsonResponse: openAiClientCreateChatCompletion,
  openAiClientChatCompletionStream: openAiClientChatCompletionStream,
};
