export interface UserTopicStatsRow {
    topic: string | null;
    total_sessions: string;       // comes back as string from SQL
    average_score: string | null; // nullable
  }