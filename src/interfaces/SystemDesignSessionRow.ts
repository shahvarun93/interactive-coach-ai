// DAO row type (matches DB exactly)
export interface SystemDesignSessionRow {
    id: string;
    user_id: string;
    prompt: string;
    answer: string | null;
    score: number | null;
    strengths: string | null;   // stored JSON text
    weaknesses: string | null;  // stored JSON text
    created_at: string;
    updated_at: string;
  }
  