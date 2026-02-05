export interface CodingSession {
  id: string;
  user_id: string;
  topic: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  question: string;
  code: string | null;
  language: string | null;
  score: number | null;
  strengths: string[] | string | null;
  weaknesses: string[] | string | null;
  issues: string[] | string | null;
  time_complexity: string | null;
  space_complexity: string | null;
  created_at: string;
  updated_at: string | null;
}
