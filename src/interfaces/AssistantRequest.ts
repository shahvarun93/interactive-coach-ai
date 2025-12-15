import { ChatMessage } from "./Chat";

export interface AssistantRequest{
  messages: ChatMessage[];
  maxTokens: number;
}
