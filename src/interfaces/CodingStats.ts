export type CodingDifficulty = "easy" | "medium" | "hard";
export type CodingTopicLabel = "strong" | "average" | "weak";

export interface CodingTopicStats {
  topic: string;
  sessions: number;
  averageScore: number;
  label: CodingTopicLabel;
}

export interface CodingUserStats {
  userId: string;
  totalSessions: number;
  answeredSessions: number;
  averageScore: number | null;
  lastSessionAt: string | null;
  topics: CodingTopicStats[];
  weakTopics: string[];
  strongTopics: string[];
}

export interface CodingHistoryItem {
  id: string;
  topic: string;
  difficulty: CodingDifficulty | "—";
  question: string;
  score: number | null;
  createdAt: string;
}

export interface CodingHistoryPage {
  userId: string;
  total: number;
  page: number;
  pageSize: number;
  items: CodingHistoryItem[];
}
