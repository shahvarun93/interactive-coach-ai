export type Difficulty = "easy" | "medium" | "hard";

export type OverallLevel = 'needs_improvement' | 'intermediate' | 'strong';

export type TopicLabel = 'weak' | 'average' | 'strong';

export interface TopicStats {
  topic: string;
  sessions: number;
  averageScore: number | null;
  label: TopicLabel;
}

export interface UserSystemDesignStats {
  userId: string;
  totalSessions: number;
  answeredSessions: number;
  averageScore: number | null;
  lastSessionAt: string | null;

  overallLevel: OverallLevel;
  topics: TopicStats[];
  weakTopics: string[];
  strongTopics: string[];
}