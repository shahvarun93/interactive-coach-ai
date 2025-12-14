export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResult {
  text: string;
  usage: { promptTokens: number | null; completionTokens: number | null };
  raw?: unknown;
}
