export type OverallLevel = 'needs_improvement' | 'intermediate' | 'strong';

export type TopicLabel = 'weak' | 'neutral' | 'strong';

export interface TopicStats {
  topic: string;
  sessions: number;
  averageScore: number | null;
  label: TopicLabel;
}

export interface UserStats {
  userId: string;
  totalSessions: number;
  answeredSessions: number;
  averageScore: number | null;
  lastSessionAt: string | null;

  overallLevel: OverallLevel | null;
  topics: TopicStats[];
  weakTopics: string[];
  strongTopics: string[];
}