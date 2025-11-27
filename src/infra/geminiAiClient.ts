import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";

/* Zod is used to make the AI output reliable and type-safe. 
The Gemini's built-in JSON schema enforcement will be leveraged for robustness.
*/

const AI_LOG_DEBUG = process.env.AI_LOG_DEBUG === "1";

// Custom error for quota issues, though Gemini API errors are generally consistent.
export class GeminiQuotaError extends Error {
  public original: unknown;

  constructor(message: string, original?: unknown) {
    super(message);
    this.name = "GeminiQuotaError";
    this.original = original;
  }
}

async function timeGeminiCall<T>(
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
    // Gemini doesn't use the exact same status/code mapping as OpenAI
    // You may need to inspect the 'err' object further for specific codes
    console.error(`[ai] ${label} error after_ms=${elapsed} msg=${msg}`);

    // This is a placeholder; you'd need to check the actual error structure from @google/genai
    if (msg.includes("quota") || msg.includes("rate limit")) {
      throw new GeminiQuotaError(msg, err);
    }

    throw err;
  }
}

// Map roles: Gemini uses 'user' and 'model' for chat turns.
export type Message = {
  role: "user" | "model" | "system"; // 'system' can be used in the prompt but not as a chat turn role in all calls
  content: string;
};

// Use the new GoogleGenAI class
const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/*
Flow for Gemini JSON:
	1.	Call Gemini with system+user messages, providing the schema directly.
	2.	Gemini guarantees the output conforms to the schema (or throws an API error).
	3.	We extract the object directly from the response.
	4.  We still use Zod as a final safety check, although the API handles most of the work.
*/
async function geminiClientJsonResponse<T>({
  model = "gemini-2.5-flash",
  messages,
  schema,
  temperature,
}: {
  model?: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  schema: z.ZodSchema<T>;
  temperature?: number;
}): Promise<T> {
  // In case upstream accidentally passes an OpenAI model name
  if (model.startsWith("gpt-")) {
    model = "gemini-2.5-flash";
  }

  const systemInstruction = messages.find((m) => m.role === "system")?.content;
  const userMessages = messages.filter((m) => m.role !== "system");

  const response = await timeGeminiCall("json_response", model, async () => {
    const result = await client.models.generateContent({
      model,
      contents: userMessages.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })),
      config: {
        ...(temperature !== undefined && { temperature }),
        responseMimeType: "application/json", // ask Gemini for JSON
      },
      ...(systemInstruction && { systemInstruction }),
    });
    return result;
  });

  const raw = extractText(response);
  console.log("[gemini coach raw]", raw);  // 
  try {
    return schema.parse(JSON.parse(raw));
  } catch (err) {
    throw new Error(
      `Failed to parse or validate Gemini JSON response: ${
        (err as Error).message
      }`
    );
  }
}

function extractText(response: any): string {
    const text = response?.text;
    if (text) return text.trim();
    throw new Error("Gemini response did not contain text content");
}
  

async function geminiClientTextResponse({
  model = "gemini-2.5-flash", // Replaced default OpenAI model
  messages,
  temperature,
}: {
  model?: string;
  messages: Message[];
  temperature?: number;
}): Promise<string> {
  const response = await timeGeminiCall("text_response", model, async () => {
    // Gemini chat roles are 'user' and 'model'. System instructions go in config.
    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    const userMessages = messages.filter(m => m.role !== 'system');

    const result = await client.models.generateContent({
      model,
      contents: userMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      config: {
        ...(temperature !== undefined && { temperature }),
        ...(systemInstruction && { systemInstruction }),
      },
    });
    return result.text;
  });

  return extractText(response);
}

export async function createEmbeddingForText(input: string): Promise<number[]> {
    if (!input.trim()) {
      throw new Error("Cannot create embedding for empty text");
    }
  
    const model = "gemini-embedding-001"; // The recommended Gemini embedding model
  
    const response = await timeGeminiCall("embedding_create", model, () =>
      client.models.embedContent({
        model,
        contents: input, // Use 'content' for the input text
      })
    );
  
    const values = response?.embeddings?.[0]?.values;
    console.log("Gemini embedding length:", values?.length);
    if (!values) {
        throw new Error("No embedding returned from Gemini API");
    }
    return values;
  }
  
  // Convenience wrapper for embeddings
  export async function embedText(text: string): Promise<number[]> {
    const model = "gemini-embedding-001"; // The recommended Gemini embedding model
  
    const resp = await timeGeminiCall("embedding_text", model, () =>
      client.models.embedContent({
        model,
        contents: text, // Use 'content' for the input text
      })
    );
  
    const values = resp?.embeddings?.[0]?.values;
    console.log("Gemini embedding length:", values?.length);
    if (!values) {
        throw new Error("No embedding returned from Gemini API");
    }
    return values;
  }
  

export const responsesClient = {
  geminiClientJsonResponse: geminiClientJsonResponse,
  geminiClientTextResponse: geminiClientTextResponse,
};

/**
 * A helper function to convert a simple Zod schema into a GoogleGenAI JSON schema object.
 * This is a basic implementation and might not cover all Zod features. 
 * For full conversion, you might use a dedicated library like 'zod-to-json-schema'.
 */
function zodToJsonSchema(schema: z.ZodSchema<any>): any {
  // A simple example for a common Zod object schema
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, any> = {};
    for (const key of Object.keys(schema.shape)) {
      const fieldSchema = schema.shape[key];
      // Basic type mapping
      if (fieldSchema instanceof z.ZodString) {
        properties[key] = { type: Type.STRING };
      } else if (fieldSchema instanceof z.ZodNumber) {
        properties[key] = { type: Type.NUMBER };
      } else if (fieldSchema instanceof z.ZodBoolean) {
        properties[key] = { type: Type.BOOLEAN };
      }
      // Add more types as needed (arrays, objects, etc.)
    }
    return {
      type: Type.OBJECT,
      properties: properties,
      required: Object.keys(schema.shape), // Assumes all are required for simplicity
    };
  }
  // Handle other types or throw an error for unsupported ones
  throw new Error("Only Zod object schemas are currently supported for conversion.");
}
