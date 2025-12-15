export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResult {
  text: string;
  finishReason:  "stop" | "length" | "tool_calls" | "content_filter" | "function_call";
  usage: { promptTokens: number | null; completionTokens: number | null };
  raw?: unknown;
}
