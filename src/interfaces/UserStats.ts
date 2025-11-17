export interface UserStats {
    userId: string;
    totalSessions: number;
    answeredSessions: number;
    averageScore: number | null;
    lastSessionAt: string | null;
  }