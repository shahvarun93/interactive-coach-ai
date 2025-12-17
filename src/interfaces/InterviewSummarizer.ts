// src/interfaces/InterviewSummarizer.ts

export interface SummarizeTranscriptMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SummarizeTranscriptParams {
  priorSummary: string | null;
  messages: SummarizeTranscriptMessage[];
}

