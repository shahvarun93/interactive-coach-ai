import { QueryResultRow } from "pg";

export interface SystemDesignSessionRow extends QueryResultRow {
  id: string;
  user_id: string;
  topic: string | null;
  difficulty: string | null;
  question: string | null;
  answer: string | null;
  score: number | null;
  created_at: string;
  updated_at: string | null;
}
