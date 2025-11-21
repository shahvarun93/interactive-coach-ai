export interface SystemDesignCoachFeedback {
  summary: string;

  // 🔹 New: explicitly call out patterns across sessions
  consistentPatterns?: string[];

  // 🔹 New: specific advice on how to fix the user’s mental model
  mentalModelFix?: string[];

  whatYouDidWell: string[];
  whatToImproveNextTime: string[];

  nextPracticeSuggestion?: {
    suggestedTopic: string;
    suggestedDifficulty: 'easy' | 'medium' | 'hard';
    reason: string;
  } | null;

  recommendedResources?: {
    id: string;
    title: string;
    url: string | null;
    reason?: string;
  }[];
}

export interface SystemDesignCoachResponse {
  sessionId: string;
  topic: string;
  difficulty: string;
  score: number;
  coachFeedback: SystemDesignCoachFeedback;
  resources: {
    id: string;
    title: string;
    url: string | null;
    topic: string;
    contentSnippet: string
  }[];
}