export interface UserStatsRow {
    user_id: string;
    total_sessions: string;
    answered_sessions: string;
    average_score: string | null;
    last_session_at: string | null;
  }