// src/interfaces/SystemDesignSession.ts
// Domain type (what service uses)
export interface SystemDesignSession {
    id: string;
    user_id: string;
    prompt: string;
    answer: string | null;
    score: number | null;
    strengths: string | null;
    weaknesses: string | null;
    created_at: string;
    updated_at: string;
  }