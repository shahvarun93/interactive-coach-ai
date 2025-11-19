// src/interfaces/SystemDesignSession.ts
// Domain type (what service uses)
export interface SystemDesignSession {
    id: string;
    user_id: string;
    prompt: string;  // the question text
    answer: string | null;
    score: number | null;
    difficulty?: string | null;
    strengths: string | null;
    weaknesses: string | null;
    created_at: string;
    updated_at: string;
    topic: string | null;
  }